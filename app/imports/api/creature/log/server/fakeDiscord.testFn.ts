import { Meteor } from 'meteor/meteor';

/*
 * A local stand-in for Discord's webhook API, for the tests: never Discord
 * itself. It keeps the messages it was sent and the threads of its forums,
 * and answers as Discord did on 2026-10-10 (tools/discord/probe): a username
 * with "discord" or "clyde" refused (50035); a Components V2 message without
 * ?with_components refused as empty (50006); in a forum, a message needs
 * thread_name or thread_id (220001), not both (220002); thread_name refused
 * outside a forum (220003); an unknown thread (10003) or message (10008).
 */

export type FakeRequest = {
  method: string,
  path: string,
  webhookId: string,
  messageId?: string,
  query: Record<string, string>,
  userAgent?: string,
  body: any,
  at: number,
};

type Reply = { status: number, headers?: Record<string, string>, body?: unknown, delayMs?: number };

// What each webhook posts into: a text channel unless named
export type FakeChannels = Record<string, 'text' | 'forum' | 'gone'>;

const IS_COMPONENTS_V2 = 1 << 15;
const error = (status: number, code: number, message: string, errors?: unknown): Reply => ({
  status, headers: { 'Content-Type': 'application/json' }, body: { code, message, ...errors ? { errors } : {} },
});

export async function fakeDiscord({ channels = {}, override }: {
  channels?: FakeChannels,
  // A reply of its own for some request, before the fake's
  override?: (request: FakeRequest, index: number) => Reply | undefined,
} = {}) {
  // node:http only exists on the server: the client's test bundle drops it
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const http = Meteor.isServer ? require('node:http') : undefined;
  const requests: FakeRequest[] = [];
  const messages = new Map<string, { id: string, channel_id: string, webhook_id: string, [key: string]: unknown }>();
  const threads = new Set<string>();
  let next = BigInt('1300000000000000000');
  const snowflake = () => String(next++);
  const channelOf = (webhookId: string) => `9${webhookId.slice(1)}`;

  function answer(request: FakeRequest): Reply {
    const kind = channels[request.webhookId] ?? 'text';
    if (kind === 'gone') return error(404, 10015, 'Unknown Webhook');
    const { body, query } = request;
    if (typeof body?.username === 'string' && /discord|clyde/i.test(body.username)) {
      return error(400, 50035, 'Invalid Form Body', {
        username: { _errors: [{ code: 'USERNAME_INVALID_CONTAINS', message: 'Username cannot contain "discord"' }] },
      });
    }
    if ((body?.flags & IS_COMPONENTS_V2) && query.with_components !== 'true') {
      return error(400, 50006, 'Cannot send an empty message');
    }
    if (request.method === 'PATCH') {
      const message = request.messageId && messages.get(request.messageId);
      if (!message || (query.thread_id && message.channel_id !== query.thread_id)) {
        return error(404, 10008, 'Unknown Message');
      }
      Object.assign(message, body, { edited_timestamp: new Date().toISOString() });
      return { status: 200, headers: { 'Content-Type': 'application/json' }, body: message };
    }
    if (body?.thread_name && query.thread_id) return error(400, 220002, 'Cannot set both thread_name and thread_id');
    let channel = channelOf(request.webhookId);
    if (query.thread_id) {
      if (!threads.has(query.thread_id)) return error(404, 10003, 'Unknown Channel');
      channel = query.thread_id;
    } else if (body?.thread_name) {
      if (kind !== 'forum') return error(400, 220003, 'Webhooks can only create threads in forum channels');
      channel = snowflake();
      threads.add(channel);
    } else if (kind === 'forum') {
      return error(400, 220001, 'Webhooks posted to forum channels must have a thread_name or thread_id');
    }
    const id = channel === query.thread_id || !body?.thread_name ? snowflake() : channel;
    const message = { ...body, id, channel_id: channel, webhook_id: request.webhookId };
    messages.set(id, message);
    return query.wait === 'true'
      ? { status: 200, headers: { 'Content-Type': 'application/json' }, body: message }
      : { status: 204 };
  }

  const server = http.createServer((req: any, res: any) => {
    let data = '';
    req.on('data', (chunk: string) => data += chunk);
    req.on('end', () => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const match = /^\/api\/v10\/webhooks\/(\d+)\/([\w-]+)(?:\/messages\/(\d+))?$/.exec(url.pathname);
      const request: FakeRequest = {
        method: req.method,
        path: url.pathname,
        webhookId: match?.[1] || '',
        ...match?.[3] && { messageId: match[3] },
        query: Object.fromEntries(url.searchParams),
        userAgent: req.headers['user-agent'],
        body: data ? JSON.parse(data) : undefined,
        at: Date.now(),
      };
      const reply = override?.(request, requests.length)
        ?? (match ? answer(request) : error(405, 0, '405: Method Not Allowed'));
      requests.push(request);
      setTimeout(() => {
        res.writeHead(reply.status, reply.headers);
        res.end(reply.body === undefined ? '' : typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body));
      }, reply.delayMs || 0);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/api/v10`,
    requests,
    messages,
    threads,
    /** Deletes a forum post, as a moderator would */
    deleteThread: (id: string) => threads.delete(id),
    deleteMessage: (id: string) => messages.delete(id),
    close: () => new Promise(resolve => {
      server.closeAllConnections();
      server.close(resolve);
    }),
  };
}

export type FakeDiscord = Awaited<ReturnType<typeof fakeDiscord>>;
