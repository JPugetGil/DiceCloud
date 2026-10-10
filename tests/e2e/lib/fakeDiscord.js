/**
 * A local stand-in for Discord's webhook API, which the dev server posts to
 * when it runs with DISCORD_WEBHOOK_TEST_API=http://127.0.0.1:3990/api/v10
 * (development only; the server ignores it in production and for any other
 * host). Never Discord itself.
 *
 * It answers as Discord did on 2026-10-10 (tools/discord/probe): a username
 * with "discord" or "clyde" refused (50035); a Components V2 message without
 * ?with_components refused as empty (50006); in a forum, a message needs
 * thread_name or thread_id (220001), not both (220002); thread_name refused
 * outside a forum (220003); an unknown thread (10003) or message (10008).
 * It keeps every request, to compare with what the check expects.
 */
const http = require('http');

const PORT = Number(process.env.E2E_DISCORD_PORT || 3990);
const IS_COMPONENTS_V2 = 1 << 15;

/**
 * `channels`: what each webhook id posts into, 'text' unless named 'forum'
 * or 'gone'. Resolves once listening, with the requests and `close`
 */
async function startFakeDiscord({ channels = {}, port = PORT } = {}) {
  const requests = [];
  const messages = new Map();
  const threads = new Set();
  let next = 1300000000000000000n;
  const snowflake = () => String(next++);
  const error = (status, code, message, errors) => ({ status, body: { code, message, ...errors && { errors } } });

  function answer(request) {
    const kind = channels[request.webhookId] || 'text';
    if (kind === 'gone') return error(404, 10015, 'Unknown Webhook');
    const { body = {}, query } = request;
    if (typeof body.username === 'string' && /discord|clyde/i.test(body.username)) {
      return error(400, 50035, 'Invalid Form Body', { username: { _errors: [{ code: 'USERNAME_INVALID_CONTAINS' }] } });
    }
    if ((body.flags & IS_COMPONENTS_V2) && query.with_components !== 'true') {
      return error(400, 50006, 'Cannot send an empty message');
    }
    if (request.method === 'PATCH') {
      const message = messages.get(request.messageId);
      if (!message || (query.thread_id && message.channel_id !== query.thread_id)) return error(404, 10008, 'Unknown Message');
      Object.assign(message, body);
      return { status: 200, body: message };
    }
    if (body.thread_name && query.thread_id) return error(400, 220002, 'Cannot set both thread_name and thread_id');
    let channel = `9${request.webhookId.slice(1)}`;
    if (query.thread_id) {
      if (!threads.has(query.thread_id)) return error(404, 10003, 'Unknown Channel');
      channel = query.thread_id;
    } else if (body.thread_name) {
      if (kind !== 'forum') return error(400, 220003, 'Webhooks can only create threads in forum channels');
      channel = snowflake();
      threads.add(channel);
    } else if (kind === 'forum') {
      return error(400, 220001, 'Webhooks posted to forum channels must have a thread_name or thread_id');
    }
    const id = body.thread_name ? channel : snowflake();
    const message = { ...body, id, channel_id: channel, webhook_id: request.webhookId };
    messages.set(id, message);
    return query.wait === 'true' ? { status: 200, body: message } : { status: 204 };
  }

  const server = http.createServer((req, res) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const match = /^\/api\/v10\/webhooks\/(\d+)\/([\w-]+)(?:\/messages\/(\d+))?$/.exec(url.pathname);
      let body;
      try {
        body = data ? JSON.parse(data) : undefined;
      } catch {
        body = data;
      }
      const request = {
        method: req.method,
        webhookId: match?.[1],
        messageId: match?.[3],
        query: Object.fromEntries(url.searchParams),
        userAgent: req.headers['user-agent'],
        body,
      };
      const reply = match ? answer(request) : error(405, 0, '405: Method Not Allowed');
      request.status = reply.status;
      request.code = reply.body?.code;
      requests.push(request);
      res.writeHead(reply.status, reply.body ? { 'Content-Type': 'application/json' } : {});
      res.end(reply.body ? JSON.stringify(reply.body) : '');
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    baseUrl: `http://127.0.0.1:${port}/api/v10`,
    requests,
    threads,
    close: () => new Promise(resolve => {
      server.closeAllConnections();
      server.close(resolve);
    }),
  };
}

module.exports = { startFakeDiscord, PORT };
