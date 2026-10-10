import { Meteor } from 'meteor/meteor';
import type { Webhook } from '/imports/api/creature/log/discord/webhookUrl';

/*
 * Requests to Discord webhooks, with the platform's fetch: each webhook has
 * its own queue, in this process's memory (one server). A queue runs tasks
 * one at a time, in the order they came; a task makes one or more requests
 * (a message, the same message again under another name, a forum post and
 * then the message in it). Each request waits when Discord's rate limit
 * headers say so, and a request refused with 429 is made again after the time
 * Discord asks for, so no message is lost and none overtakes another.
 *
 * A webhook Discord no longer knows (404, Unknown Webhook) or whose token it
 * refuses (401) is never called again by this process, and onGone is told:
 * Discord asks clients to stop using such a webhook, and counts 401, 403 and
 * 429 answers against the server's IP address. A 404 about something else,
 * a deleted thread or message, is the task's to handle.
 *
 * Only the id and token of a webhook are used: the request always goes to the
 * API this sender was made for, Discord's (see discordApiBase).
 */

export const DISCORD_API = 'https://discord.com/api/v10';

// The environment variable of the local fake, and the hosts it may point at
export const TEST_API_VARIABLE = 'DISCORD_WEBHOOK_TEST_API';
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];

// https://docs.discord.com/developers/topics/opcodes-and-status-codes
export const DISCORD_CODES = {
  unknownChannel: 10003,
  unknownMessage: 10008,
  unknownWebhook: 10015,
  emptyMessage: 50006,
  invalidFormBody: 50035,
  // A forum post needs thread_name or thread_id; not both; a webhook only
  // creates threads in a forum
  forumNeedsThread: 220001,
  forumThreadNameAndId: 220002,
  threadsOnlyInForums: 220003,
} as const;

/**
 * Where webhook requests go: Discord. In development and tests, the local
 * fake that TEST_API_VARIABLE names, when it is a plain http URL on this
 * machine. Under tests without it, nowhere (undefined): a test never reaches
 * Discord.
 */
export function discordApiBase(
  env: Record<string, string | undefined> = process.env,
  meteor: { isDevelopment?: boolean, isTest?: boolean, isAppTest?: boolean } = Meteor,
): string | undefined {
  const testing = !!(meteor.isTest || meteor.isAppTest);
  if (!meteor.isDevelopment && !testing) return DISCORD_API;
  const override = env[TEST_API_VARIABLE];
  if (override) {
    let url: URL | undefined;
    try {
      url = new URL(override);
    } catch {
      url = undefined;
    }
    if (url?.protocol === 'http:' && LOOPBACK_HOSTS.includes(url.hostname)) return override.replace(/\/+$/, '');
    console.warn(`${TEST_API_VARIABLE} ignored: only an http URL on this machine is accepted`);
  }
  return testing ? undefined : DISCORD_API;
}

/**
 * The User-Agent Discord asks every client of its HTTP API for, "DiscordBot
 * ($url, $versionNumber)": requests without a valid one may be blocked
 */
export function discordUserAgent(url: string, version: string) {
  return `DiscordBot (${url}, ${version})`;
}

// Seconds in a header or a body, as milliseconds
function milliseconds(value: unknown): number | undefined {
  const seconds = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds * 1000) : undefined;
}

// A message Discord returns: with ?wait=true, and for an edit
export type DiscordMessage = { id: string, channel_id?: string, [key: string]: unknown };

export type DiscordRequest = {
  // The message to post, or the new content of the one to edit
  body: Record<string, unknown>,
  // Edits this message of the webhook (PATCH) instead of posting a new one
  messageId?: string,
  // In this thread: a forum post, or a thread of a text channel
  threadId?: string,
  // Discord answers with the message, whose id is then kept
  wait?: boolean,
};

export type DiscordResult =
  | { ok: true, status: number, message?: DiscordMessage }
  | {
    ok: false,
    status?: number,
    // Discord's error code, and the fields of the body it refused (`username`)
    code?: number,
    fields: string[],
    detail: string,
    // The webhook is gone (404 Unknown Webhook, 401): nothing more is sent to it
    gone?: boolean,
  };

/** Makes one request of a task, rate limits and retries included */
export type Requester = (request: DiscordRequest) => Promise<DiscordResult>;

/** A task of a webhook's queue: its requests leave before the next task's */
export type WebhookTask<T = unknown> = (request: Requester) => Promise<T>;

type Outcome =
  | { kind: 'sent', status: number, message?: DiscordMessage, waitMs?: number }
  | { kind: 'rateLimited', waitMs: number }
  | { kind: 'gone', status: number, detail: string }
  | { kind: 'failed', status?: number, code?: number, fields: string[], detail: string, retry: boolean };

type Job = { task: WebhookTask<any>, resolve: (value: unknown) => void };

type Queue = {
  webhook: Webhook,
  jobs: Job[],
  // When the next request may leave, from Discord's rate limit headers
  notBefore: number,
  // Tasks refused since the queue was last full, logged once
  overflowed: number,
};

export type WebhookSenderOptions = {
  // The API, without /webhooks
  baseUrl: string,
  // The User-Agent of every request (discordUserAgent)
  userAgent?: string,
  fetch?: typeof globalThis.fetch,
  sleep?: (ms: number) => Promise<void>,
  now?: () => number,
  // Called once a webhook answered 404 Unknown Webhook or 401
  onGone?: (webhook: Webhook, status: number) => unknown,
  // Tasks waiting per webhook, beyond which new ones are dropped
  maxQueue?: number,
  // Answers 429 in a row for one request before it is given up
  maxRateLimited?: number,
  // Attempts of a request on a server error or a network failure
  maxAttempts?: number,
  // The longest wait honoured, and a request's timeout
  maxWaitMs?: number,
  timeoutMs?: number,
};

// Discord's error body: { code, message, errors: { username: { _errors: [...] } } }
function readError(text: string): { code?: number, fields: string[], message?: string } {
  try {
    const body = JSON.parse(text);
    return {
      code: typeof body?.code === 'number' ? body.code : undefined,
      fields: body?.errors && typeof body.errors === 'object' ? Object.keys(body.errors) : [],
      message: typeof body?.message === 'string' ? body.message : undefined,
    };
  } catch {
    return { fields: [] };
  }
}

/**
 * Sends to webhooks, each webhook through its own queue. `enqueue` returns at
 * once a promise of the task's result (undefined when it never ran: queue
 * full, webhook gone); `send` queues plain messages; `idle` resolves once
 * every queue is empty.
 */
export function createWebhookSender({
  baseUrl,
  userAgent,
  fetch = globalThis.fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = Date.now,
  onGone,
  maxQueue = 50,
  maxRateLimited = 10,
  maxAttempts = 3,
  maxWaitMs = 10 * 60 * 1000,
  timeoutMs = 15 * 1000,
}: WebhookSenderOptions) {
  const queues = new Map<string, Queue>();
  const running = new Set<Promise<void>>();
  // Webhooks Discord answered 404 Unknown Webhook or 401, with that status:
  // never called again
  const gone = new Map<string, number>();
  const keyOf = (webhook: Webhook) => `${webhook.id}/${webhook.token}`;

  async function post(webhook: Webhook, request: DiscordRequest): Promise<Outcome> {
    const url = new URL(`${baseUrl}/webhooks/${webhook.id}/${webhook.token}`
      + (request.messageId ? `/messages/${request.messageId}` : ''));
    if (request.wait && !request.messageId) url.searchParams.set('wait', 'true');
    if (request.threadId) url.searchParams.set('thread_id', request.threadId);
    // Without it Discord ignores the components of a webhook no application
    // owns, and refuses a Components V2 message as empty (50006)
    const components = request.body.components;
    if (Array.isArray(components) && components.length) url.searchParams.set('with_components', 'true');
    let response: Response;
    try {
      response = await fetch(url, {
        method: request.messageId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', ...userAgent && { 'User-Agent': userAgent } },
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      return { kind: 'failed', fields: [], detail: String((e as Error)?.message || e), retry: true };
    }
    // Read the body in every case: it frees the connection
    const text = await response.text().catch(() => '');
    const resetAfter = milliseconds(response.headers.get('x-ratelimit-reset-after'));
    if (response.ok) {
      const exhausted = response.headers.get('x-ratelimit-remaining') === '0';
      let message: DiscordMessage | undefined;
      try {
        message = text ? JSON.parse(text) : undefined;
      } catch {
        message = undefined;
      }
      return {
        kind: 'sent', status: response.status,
        ...message?.id && { message },
        ...exhausted && resetAfter !== undefined && { waitMs: resetAfter },
      };
    }
    if (response.status === 429) {
      let body: { retry_after?: number } = {};
      try {
        body = JSON.parse(text);
      } catch {
        // Cloudflare's ban page is HTML: the header says how long
      }
      const waitMs = milliseconds(body?.retry_after)
        ?? milliseconds(response.headers.get('retry-after'))
        ?? resetAfter
        ?? 1000;
      return { kind: 'rateLimited', waitMs };
    }
    const detail = text.slice(0, 300);
    const error = readError(text);
    // A 404 that names something else than the webhook (a deleted thread or
    // message) leaves the webhook alone; one without a code is taken for it
    const unknownWebhook = response.status === 404
      && (error.code === undefined || error.code === DISCORD_CODES.unknownWebhook);
    if (unknownWebhook || response.status === 401) {
      return { kind: 'gone', status: response.status, detail };
    }
    return {
      kind: 'failed', status: response.status, code: error.code, fields: error.fields, detail,
      retry: response.status >= 500,
    };
  }

  /** The requests of a queue's tasks, one at a time */
  function requester(key: string, queue: Queue): Requester {
    return async (request) => {
      let rateLimited = 0;
      let attempts = 0;
      while (true) {
        if (gone.has(key)) return { ok: false, gone: true, fields: [], detail: 'webhook gone' };
        const wait = queue.notBefore - now();
        if (wait > 0) await sleep(Math.min(wait, maxWaitMs));
        const outcome = await post(queue.webhook, request);
        if (outcome.kind === 'sent') {
          queue.notBefore = outcome.waitMs ? now() + outcome.waitMs : 0;
          return { ok: true, status: outcome.status, ...outcome.message && { message: outcome.message } };
        }
        if (outcome.kind === 'rateLimited') {
          // The same request again, once Discord allows it
          rateLimited += 1;
          queue.notBefore = now() + Math.min(outcome.waitMs, maxWaitMs);
          if (rateLimited >= maxRateLimited) {
            return { ok: false, status: 429, fields: [], detail: `still rate limited after ${rateLimited} tries` };
          }
        } else if (outcome.kind === 'gone') {
          gone.set(key, outcome.status);
          console.warn(`Discord webhook ${queue.webhook.id} answered ${outcome.status} (${outcome.detail}): forgotten`);
          return { ok: false, gone: true, status: outcome.status, fields: [], detail: outcome.detail };
        } else {
          attempts += 1;
          if (!outcome.retry || attempts >= maxAttempts) {
            const { kind, retry, ...failure } = outcome; // eslint-disable-line @typescript-eslint/no-unused-vars
            return { ok: false, ...failure, detail: `${failure.detail} (after ${attempts} attempt(s))` };
          }
          queue.notBefore = now() + 1000 * 2 ** (attempts - 1);
        }
      }
    };
  }

  async function drain(key: string, queue: Queue) {
    const request = requester(key, queue);
    while (queue.jobs.length) {
      const job = queue.jobs[0];
      let result: unknown;
      try {
        result = await job.task(request);
      } catch (e) {
        console.error(e);
      }
      queue.jobs.shift();
      job.resolve(result);
      if (gone.has(key)) {
        const dropped = queue.jobs.splice(0);
        if (dropped.length) console.warn(`Discord webhook ${queue.webhook.id}: ${dropped.length} message(s) dropped`);
        dropped.forEach(other => other.resolve(undefined));
        try {
          await onGone?.(queue.webhook, gone.get(key) as number);
        } catch (e) {
          console.error(e);
        }
      }
    }
    queues.delete(key);
  }

  // Queues a task; undefined when it is refused (webhook gone, queue full)
  function add<T>(webhook: Webhook, task: WebhookTask<T>): Promise<T | undefined> | undefined {
    const key = keyOf(webhook);
    if (gone.has(key)) return undefined;
    let queue = queues.get(key);
    const start = !queue;
    if (!queue) {
      queue = { webhook, jobs: [], notBefore: 0, overflowed: 0 };
      queues.set(key, queue);
    }
    if (queue.jobs.length >= maxQueue) {
      if (!queue.overflowed) console.warn(`Discord webhook ${webhook.id}: ${maxQueue} messages waiting, new ones dropped`);
      queue.overflowed += 1;
      return undefined;
    }
    queue.overflowed = 0;
    const result = new Promise<T | undefined>(resolve => {
      (queue as Queue).jobs.push({ task, resolve: resolve as (value: unknown) => void });
    });
    if (start) {
      const run = drain(key, queue).catch(e => {
        console.error(e);
        queues.delete(key);
      }).finally(() => running.delete(run));
      running.add(run);
    }
    return result;
  }

  function enqueue<T>(webhook: Webhook, task: WebhookTask<T>): Promise<T | undefined> {
    return add(webhook, task) ?? Promise.resolve(undefined);
  }

  /** Posts plain messages, each a task of its own; false when some were dropped */
  function send(webhook: Webhook, messages: Record<string, unknown>[]): boolean {
    if (gone.has(keyOf(webhook)) || !messages.length) return false;
    let accepted = true;
    for (const message of messages) {
      const queued = add(webhook, async request => {
        const result = await postMessage(request, { body: message });
        if (!result.ok && !result.gone) {
          console.warn(`Discord webhook ${webhook.id}: message dropped, ${result.status ?? 'no answer'}: ${result.detail}`);
        }
        return result;
      });
      if (!queued) accepted = false;
    }
    return accepted;
  }

  async function idle() {
    while (running.size) await Promise.all([...running]);
  }

  return {
    enqueue,
    send,
    idle,
    pending: (webhook: Webhook) => queues.get(keyOf(webhook))?.jobs.length ?? 0,
    isGone: (webhook: Webhook) => gone.has(keyOf(webhook)),
  };
}

export type WebhookSender = ReturnType<typeof createWebhookSender>;

// The name a message goes under when Discord refuses the character's
export const FALLBACK_USERNAME = 'DiceCloud';

const refusedUsername = (result: DiscordResult) => !result.ok && result.status === 400
  && result.fields.includes('username');
// A Components V2 message Discord does not take: empty once it ignored the
// components, or components it refuses
const refusedComponents = (result: DiscordResult) => !result.ok && result.status === 400
  && (result.code === DISCORD_CODES.emptyMessage || result.fields.includes('components') || result.fields.includes('flags'));

/**
 * Posts a message (or edits one), and when Discord refuses it, the closest
 * one it takes: under DiceCloud's name if it refuses the character's, as the
 * `fallback` messages (embeds) if it refuses the components. Returns the
 * result of the last request, the first fallback's when there are several.
 */
export async function postMessage(request: Requester, {
  body, fallback = [], messageId, threadId, wait,
}: {
  body: Record<string, unknown>,
  fallback?: Record<string, unknown>[],
  messageId?: string,
  threadId?: string,
  wait?: boolean,
}): Promise<DiscordResult> {
  let message = body;
  let others = fallback;
  let result = await request({ body: message, messageId, threadId, wait });
  if (refusedUsername(result) && message.username !== FALLBACK_USERNAME) {
    const renamed = (part: Record<string, unknown>) => 'username' in part ? { ...part, username: FALLBACK_USERNAME } : part;
    message = renamed(message);
    others = others.map(renamed);
    result = await request({ body: message, messageId, threadId, wait });
  }
  if (refusedComponents(result) && others.length) {
    const [first, ...rest] = others;
    result = await request({ body: first, messageId, threadId, wait });
    for (const part of rest) {
      if (!result.ok) break;
      // An edit has one message: the rest of a long entry follows it
      const next = await request({ body: part, threadId });
      if (!next.ok) return next;
    }
  }
  return result;
}
