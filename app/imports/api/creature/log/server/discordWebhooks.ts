import { Meteor } from 'meteor/meteor';
import { escapeRegExp } from 'lodash';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { discordMessages, type LogLine, type WebhookMessage } from '/imports/api/creature/log/discord/discordMessages';

/*
 * Posts a character's log entries to its Discord webhook (option 1 of the
 * Discord analysis), with the platform's fetch.
 *
 * Only the id and token are taken from the stored URL: the request always
 * goes to Discord, so a character's webhook setting cannot point the server
 * at another host. In development and tests only, a server environment
 * variable may send them to a local fake of Discord's API instead (see
 * discordApiBase); no user can set it, and production ignores it.
 *
 * Each webhook has its own queue, in this process's memory (one server): its
 * messages leave in the order they were logged, one at a time, waiting when
 * Discord's rate limit headers say so, and a message refused with 429 is sent
 * again after the time Discord asks for. A webhook Discord no longer knows
 * (404) or whose token it refuses (401) is removed from the characters that
 * have it, so that it is not called again on every roll: Discord asks clients
 * to stop using such a webhook, and counts 401, 403 and 429 answers against
 * the server's IP address.
 */

export const DISCORD_API = 'https://discord.com/api/v10';

// The environment variable of the local fake, and the hosts it may point at
export const TEST_API_VARIABLE = 'DISCORD_WEBHOOK_TEST_API';
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];

export type Webhook = { id: string, token: string };

/** A webhook's id and token, from its URL: https://discord.com/api/webhooks/<id>/<token> */
export function parseWebhookURL(webhookURL?: string | null): Webhook | undefined {
  if (!webhookURL || typeof webhookURL !== 'string') return undefined;
  const parts = webhookURL.split(/[?#]/)[0].split('/').filter(Boolean);
  const token = parts.pop();
  const id = parts.pop();
  if (!/^\d+$/.test(id || '') || !/^[\w-]+$/.test(token || '')) return undefined;
  return { id: id as string, token: token as string };
}

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

// Seconds in a header or a body, as milliseconds
function milliseconds(value: unknown): number | undefined {
  const seconds = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds * 1000) : undefined;
}

type Outcome =
  | { kind: 'sent', waitMs?: number }
  | { kind: 'rateLimited', waitMs: number }
  | { kind: 'gone', status: number, detail: string }
  | { kind: 'failed', status?: number, detail: string, retry: boolean };

type Queue = {
  webhook: Webhook,
  messages: WebhookMessage[],
  // When the next request may leave, from Discord's rate limit headers
  notBefore: number,
  // Messages refused since the queue was last full, logged once
  overflowed: number,
};

export type WebhookSenderOptions = {
  // The API, without /webhooks
  baseUrl: string,
  fetch?: typeof globalThis.fetch,
  sleep?: (ms: number) => Promise<void>,
  now?: () => number,
  // Called once a webhook answered 404 or 401
  onGone?: (webhook: Webhook, status: number) => unknown,
  // Messages waiting per webhook, beyond which new ones are dropped
  maxQueue?: number,
  // Answers 429 in a row for one message before it is dropped
  maxRateLimited?: number,
  // Attempts of a message on a server error or a network failure
  maxAttempts?: number,
  // The longest wait honoured, and a request's timeout
  maxWaitMs?: number,
  timeoutMs?: number,
};

/**
 * Sends messages to webhooks, each webhook through its own queue. `send`
 * returns at once; `idle` resolves once every queue is empty.
 */
export function createWebhookSender({
  baseUrl,
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
  // Webhooks Discord answered 404 or 401: never called again by this process
  const gone = new Set<string>();
  const keyOf = (webhook: Webhook) => `${webhook.id}/${webhook.token}`;

  async function post(webhook: Webhook, message: WebhookMessage): Promise<Outcome> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/webhooks/${webhook.id}/${webhook.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      return { kind: 'failed', detail: String((e as Error)?.message || e), retry: true };
    }
    // Read the body in every case: it frees the connection
    const text = await response.text().catch(() => '');
    const resetAfter = milliseconds(response.headers.get('x-ratelimit-reset-after'));
    if (response.ok) {
      const exhausted = response.headers.get('x-ratelimit-remaining') === '0';
      return { kind: 'sent', ...exhausted && resetAfter !== undefined && { waitMs: resetAfter } };
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
    if (response.status === 404 || response.status === 401) {
      return { kind: 'gone', status: response.status, detail };
    }
    return { kind: 'failed', status: response.status, detail, retry: response.status >= 500 };
  }

  async function drain(key: string, queue: Queue) {
    let rateLimited = 0;
    let attempts = 0;
    while (queue.messages.length) {
      const wait = queue.notBefore - now();
      if (wait > 0) await sleep(Math.min(wait, maxWaitMs));
      const outcome = await post(queue.webhook, queue.messages[0]);
      if (outcome.kind === 'sent') {
        queue.messages.shift();
        rateLimited = 0;
        attempts = 0;
        queue.notBefore = outcome.waitMs ? now() + outcome.waitMs : 0;
      } else if (outcome.kind === 'rateLimited') {
        // The same message again, once Discord allows it: none is lost, none overtakes it
        rateLimited += 1;
        queue.notBefore = now() + Math.min(outcome.waitMs, maxWaitMs);
        if (rateLimited >= maxRateLimited) {
          console.warn(`Discord webhook ${queue.webhook.id}: still rate limited after ${rateLimited} tries, a message dropped`);
          queue.messages.shift();
          rateLimited = 0;
        }
      } else if (outcome.kind === 'gone') {
        gone.add(key);
        const dropped = queue.messages.length;
        queue.messages.length = 0;
        console.warn(`Discord webhook ${queue.webhook.id} answered ${outcome.status} (${outcome.detail}): `
          + `forgotten, ${dropped} message(s) dropped`);
        try {
          await onGone?.(queue.webhook, outcome.status);
        } catch (e) {
          console.error(e);
        }
      } else {
        attempts += 1;
        if (!outcome.retry || attempts >= maxAttempts) {
          console.warn(`Discord webhook ${queue.webhook.id}: message dropped after ${attempts} attempt(s), `
            + `${outcome.status ?? 'no answer'}: ${outcome.detail}`);
          queue.messages.shift();
          attempts = 0;
        } else {
          queue.notBefore = now() + 1000 * 2 ** (attempts - 1);
        }
      }
    }
    queues.delete(key);
  }

  function send(webhook: Webhook, messages: WebhookMessage[]): boolean {
    const key = keyOf(webhook);
    if (gone.has(key) || !messages.length) return false;
    let queue = queues.get(key);
    const start = !queue;
    if (!queue) {
      queue = { webhook, messages: [], notBefore: 0, overflowed: 0 };
      queues.set(key, queue);
    }
    let accepted = true;
    for (const message of messages) {
      if (queue.messages.length >= maxQueue) {
        if (!queue.overflowed) console.warn(`Discord webhook ${webhook.id}: ${maxQueue} messages waiting, new ones dropped`);
        queue.overflowed += 1;
        accepted = false;
      } else {
        queue.overflowed = 0;
        queue.messages.push(message);
      }
    }
    if (start) {
      const run = drain(key, queue).catch(e => {
        console.error(e);
        queues.delete(key);
      }).finally(() => running.delete(run));
      running.add(run);
    }
    return accepted;
  }

  async function idle() {
    while (running.size) await Promise.all([...running]);
  }

  return {
    send,
    idle,
    pending: (webhook: Webhook) => queues.get(keyOf(webhook))?.messages.length ?? 0,
    isGone: (webhook: Webhook) => gone.has(keyOf(webhook)),
  };
}

export type WebhookSender = ReturnType<typeof createWebhookSender>;

/**
 * Removes a webhook from every character that has it (several characters of
 * a table often share one). Returns how many there were.
 */
export async function forgetWebhook(webhook: Webhook, status: number): Promise<number> {
  const url = new RegExp(`/${escapeRegExp(webhook.id)}/${escapeRegExp(webhook.token)}(?:[/?#]|$)`);
  const count = await Creatures.updateAsync(
    { 'settings.discordWebhook': url },
    { $unset: { 'settings.discordWebhook': 1 } },
    { multi: true },
  );
  console.warn(`Discord webhook ${webhook.id} answered ${status}: removed from ${count} character(s)`);
  return count;
}

function defaultSender(): WebhookSender | undefined {
  const baseUrl = discordApiBase();
  if (baseUrl && baseUrl !== DISCORD_API) console.warn(`Discord webhooks are sent to ${baseUrl} (${TEST_API_VARIABLE})`);
  return baseUrl ? createWebhookSender({ baseUrl, onGone: forgetWebhook }) : undefined;
}

let sender: WebhookSender | undefined | null = null;

/**
 * Replaces the sender the log uses, for a test; returns the one it replaced.
 * Refused outside tests.
 */
export function setWebhookSender(replacement: WebhookSender | undefined) {
  if (!Meteor.isTest && !Meteor.isAppTest) throw new Meteor.Error('test-only', 'Only tests replace the webhook sender');
  const previous = sender ?? undefined;
  sender = replacement;
  return previous;
}

// One lookup at a time per character: its entries keep their order
const intake = new Map<string, Promise<void>>();

type LogEntry = { creatureId?: string, content?: LogLine[], date?: Date | string };

async function queueLog(creatureId: string, log: LogEntry, target: WebhookSender) {
  const creature = await Creatures.findOneAsync(creatureId, {
    fields: { name: 1, color: 1, avatarPicture: 1, owner: 1, 'settings.discordWebhook': 1 },
  });
  const webhook = parseWebhookURL(creature?.settings?.discordWebhook);
  if (!creature || !webhook || target.isGone(webhook)) return;
  const owner = await Meteor.users.findOneAsync(creature.owner as string, { fields: { 'preferences.language': 1 } });
  const messages = discordMessages({
    log,
    creature,
    language: (owner as { preferences?: { language?: string } } | undefined)?.preferences?.language,
    sheetUrl: Meteor.absoluteUrl(`character/${creature._id}`),
  });
  target.send(webhook, messages);
}

/**
 * Posts a log entry to its character's Discord webhook, if it has one. Returns
 * at once: a log never waits on Discord. Once per entry, after it is written.
 */
export function sendLogToDiscord(log: LogEntry) {
  if (sender === null) sender = defaultSender();
  const target = sender;
  const creatureId = log?.creatureId;
  if (!target || !creatureId) return;
  const next = (intake.get(creatureId) ?? Promise.resolve())
    .then(() => queueLog(creatureId, log, target))
    .catch(e => console.error(e));
  intake.set(creatureId, next);
  next.finally(() => {
    if (intake.get(creatureId) === next) intake.delete(creatureId);
  });
}

/** Resolves once the entries logged so far are queued (for tests) */
export async function discordIntakeIdle() {
  while (intake.size) await Promise.all([...intake.values()]);
}
