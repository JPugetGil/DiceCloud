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
 *
 * And Discord's OAuth2 (phase B): the authorization page, which redirects at
 * once with a code (or `access_denied`) as `authorizeAs` says, and keeps the
 * user's authorization of each application and scope; with prompt=none, a
 * code at once for an authorization given before, else an error
 * (`consent_required` unless `silentError` says another: what Discord does
 * then was not probed, DiceCloud starts again with the page); the code's
 * exchange, which creates a webhook with `webhook.incoming` (application
 * owned, in a text channel: the picker never offers a forum), up to 15 per
 * channel (30007); /users/@me with `identify`; the token's revocation; a
 * webhook's GET and DELETE with its token.
 */
const http = require('http');
const crypto = require('crypto');

/*
 * The interactions (phase C): `interact` sends one to the app's endpoint,
 * signed as Discord signs them, with a test key pair drawn from a fixed seed,
 * whose public key the dev server's settings carry (`discord.publicKey`,
 * INTERACTIONS_PUBLIC_KEY below); the client credentials token, the global
 * commands' overwrite, and the interaction's own webhook, whose original
 * message and follow-ups it keeps.
 */
const SEED = crypto.createHash('sha256').update('dicecloud e2e fake discord interactions').digest();
const PRIVATE_KEY = crypto.createPrivateKey({
  key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), SEED]), format: 'der', type: 'pkcs8',
});
const INTERACTIONS_PUBLIC_KEY = crypto.createPublicKey(PRIVATE_KEY).export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');

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
  // Threads a user made in a text channel: their channel, and whether they
  // still take messages (plausible codes for the others: DiceCloud must not count on them)
  const textThreads = new Map();
  let next = 1300000000000000000n;
  const snowflake = () => String(next++);
  const secret = () => `${snowflake()}-${Math.random().toString(36).slice(2)}`;
  const error = (status, code, message, errors) => ({ status, body: { code, message, ...errors && { errors } } });

  // OAuth2: what the next authorization gives, the codes, tokens and webhooks
  let authorization = {
    user: { id: '1400000000000000001', username: 'e2e_player', global_name: 'E2E player' },
    guildId: '1500000000000000001',
    channelId: '1500000000000000002',
  };
  const grants = new Map();
  const accessTokens = new Map();
  const oauthWebhooks = new Map();
  // Interactions: the commands registered, and per token what became of it
  const registeredCommands = new Map();
  const interactions = new Map();
  // The authorizations users gave: `<client id>|<user id>|<scope>`
  const consents = new Set();

  function authorize(url) {
    const target = new URL(url.searchParams.get('redirect_uri') || 'http://invalid');
    if (url.searchParams.get('state')) target.searchParams.set('state', url.searchParams.get('state'));
    const scope = url.searchParams.get('scope') || '';
    const clientId = url.searchParams.get('client_id');
    const consent = `${clientId}|${authorization.user?.id}|${scope}`;
    if (authorization.deny) {
      target.searchParams.set('error', 'access_denied');
    } else if (url.searchParams.get('prompt') === 'none' && !consents.has(consent)) {
      target.searchParams.set('error', authorization.silentError || 'consent_required');
    } else {
      const code = secret();
      grants.set(code, {
        scope, redirectUri: url.searchParams.get('redirect_uri'), clientId, used: false, authorization: { ...authorization },
      });
      consents.add(consent);
      target.searchParams.set('code', code);
    }
    return { status: 302, headers: { Location: target.href } };
  }

  function exchange(form, basic) {
    const grant = grants.get(form.code);
    if (!basic?.id || !basic.secret) return error(401, 0, '401: Unauthorized');
    // The application's own token (client credentials grant)
    if (form.grant_type === 'client_credentials') {
      const access = secret();
      accessTokens.set(access, { scope: form.scope || '', application: basic.id });
      return { status: 200, body: { token_type: 'Bearer', access_token: access, expires_in: 604800, scope: form.scope || '' } };
    }
    if (form.grant_type !== 'authorization_code' || !grant || grant.used || grant.redirectUri !== form.redirect_uri
      || grant.clientId !== basic.id) {
      return { status: 400, body: { error: 'invalid_grant' } };
    }
    grant.used = true;
    const access = secret();
    const body = {
      token_type: 'Bearer', access_token: access, expires_in: 604800, refresh_token: secret(),
      scope: grant.scope === 'webhook.incoming' ? '' : grant.scope,
    };
    if (grant.scope.split(' ').includes('webhook.incoming')) {
      const channelId = grant.authorization.channelId;
      const inChannel = [...oauthWebhooks.values()].filter(w => w.channel_id === channelId && channels[w.id] !== 'gone');
      if (inChannel.length >= 15) return error(400, 30007, 'Maximum number of webhooks reached (15)');
      const webhook = {
        id: snowflake(), token: secret(), type: 1, application_id: basic.id, channel_id: channelId,
        guild_id: grant.authorization.guildId, name: 'DiceCloud',
      };
      oauthWebhooks.set(webhook.id, webhook);
      body.webhook = webhook;
    }
    accessTokens.set(access, { scope: grant.scope, user: grant.authorization.user });
    return { status: 200, body };
  }

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
      const closed = query.thread_id && textThreads.get(query.thread_id);
      if (closed && closed.state !== 'open') return closed.state === 'locked' ? error(403, 160005, 'Thread is locked') : error(400, 50083, 'Thread is archived');
      const message = messages.get(request.messageId);
      if (!message || (query.thread_id && message.channel_id !== query.thread_id)) return error(404, 10008, 'Unknown Message');
      Object.assign(message, body);
      return { status: 200, body: message };
    }
    if (body.thread_name && query.thread_id) return error(400, 220002, 'Cannot set both thread_name and thread_id');
    let channel = oauthWebhooks.get(request.webhookId)?.channel_id ?? `9${request.webhookId.slice(1)}`;
    const textThread = query.thread_id ? textThreads.get(query.thread_id) : undefined;
    if (textThread) {
      if (textThread.state === 'deleted') return error(404, 10003, 'Unknown Channel');
      if (textThread.parent !== channel) return error(400, 50035, 'Invalid Form Body', { thread_id: { _errors: [{ code: 'THREAD_NOT_IN_CHANNEL' }] } });
      if (textThread.state === 'archived') return error(400, 50083, 'Thread is archived');
      if (textThread.state === 'locked') return error(403, 160005, 'Thread is locked');
      channel = query.thread_id;
    } else if (query.thread_id) {
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
        body = !data ? undefined : /x-www-form-urlencoded/.test(req.headers['content-type'] || '')
          ? Object.fromEntries(new URLSearchParams(data)) : JSON.parse(data);
      } catch {
        body = data;
      }
      const request = {
        method: req.method,
        path: url.pathname,
        webhookId: match?.[1],
        messageId: match?.[3],
        query: Object.fromEntries(url.searchParams),
        userAgent: req.headers['user-agent'],
        body,
      };
      const interactionMatch = /^\/api\/v10\/webhooks\/(\d+)\/([\w.-]+)(\/messages\/@original)?$/.exec(url.pathname);
      const commandsMatch = /^\/api\/v10\/applications\/(\d+)\/commands$/.exec(url.pathname);
      const basicAuth = /^Basic (.+)$/.exec(req.headers.authorization || '')?.[1];
      const [id, password] = basicAuth ? Buffer.from(basicAuth, 'base64').toString().split(':') : [];
      let reply;
      if (interactionMatch && interactions.has(interactionMatch[2])) {
        // The webhook of an interaction: its original message edited, follow-ups posted
        const record = interactions.get(interactionMatch[2]);
        if (interactionMatch[3] && req.method === 'PATCH') {
          record.original = { ...record.original, ...body, id: record.original?.id || snowflake() };
          record.edits.push(body);
          reply = { status: 200, body: record.original };
        } else if (!interactionMatch[3] && req.method === 'POST') {
          const followUp = { ...body, id: snowflake() };
          record.followUps.push(followUp);
          reply = { status: 200, body: followUp };
        } else reply = error(405, 0, '405: Method Not Allowed');
      } else if (req.method === 'PUT' && commandsMatch) {
        const token = accessTokens.get((req.headers.authorization || '').replace(/^Bearer /, ''));
        if (!token || token.application !== commandsMatch[1] || !token.scope.split(' ').includes('applications.commands.update')) {
          reply = error(401, 0, '401: Unauthorized');
        } else {
          const commands = (Array.isArray(body) ? body : []).map(command => ({ ...command, id: snowflake(), application_id: commandsMatch[1] }));
          registeredCommands.set(commandsMatch[1], commands);
          reply = { status: 200, body: commands };
        }
      } else if (req.method === 'GET' && url.pathname === '/oauth2/authorize') reply = authorize(url);
      else if (req.method === 'POST' && url.pathname === '/api/v10/oauth2/token') reply = exchange(body || {}, basicAuth && { id, secret: password });
      else if (req.method === 'POST' && url.pathname === '/api/v10/oauth2/token/revoke') {
        const token = accessTokens.get(body?.token);
        if (token) token.revoked = true;
        // The user's authorization goes with it
        for (const consent of consents) if (token && consent.split('|')[1] === token.user.id) consents.delete(consent);
        reply = { status: 200, body: {} };
      } else if (req.method === 'GET' && url.pathname === '/api/v10/users/@me') {
        const token = accessTokens.get((req.headers.authorization || '').replace(/^Bearer /, ''));
        reply = !token || token.revoked || !token.scope.split(' ').includes('identify')
          ? error(401, 0, '401: Unauthorized') : { status: 200, body: { ...token.user, avatar: null, discriminator: '0' } };
      } else if (match && !match[3] && ['GET', 'DELETE'].includes(req.method)) {
        const webhook = oauthWebhooks.get(match[1]);
        if (channels[match[1]] === 'gone' || (webhook && webhook.token !== match[2])) reply = error(404, 10015, 'Unknown Webhook');
        else if (req.method === 'DELETE') {
          channels[match[1]] = 'gone';
          reply = { status: 204 };
        } else reply = { status: 200, body: webhook ?? { id: match[1], type: 1, channel_id: `9${match[1].slice(1)}`, guild_id: '1500000000000000001', name: 'Pasted' } };
      } else reply = match ? answer(request) : error(405, 0, '405: Method Not Allowed');
      request.status = reply.status;
      request.code = reply.body?.code;
      requests.push(request);
      res.writeHead(reply.status, { ...reply.body && { 'Content-Type': 'application/json' }, ...reply.headers });
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
    // OAuth2: what the next authorizations give; the webhooks and tokens handed out
    authorizeAs: next => {
      authorization = next;
    },
    oauthWebhooks,
    accessTokens,
    consents,
    registeredCommands,
    interactions,
    /** A thread a user makes in a text channel; returns its id */
    createThread: channelId => {
      const id = snowflake();
      textThreads.set(id, { parent: channelId, state: 'open' });
      return id;
    },
    /** A thread archived, locked or deleted in Discord */
    closeThread: (id, state) => {
      const thread = textThreads.get(id);
      if (thread) thread.state = state;
    },
    /**
     * Sends an interaction to the app's endpoint as Discord does, signed
     * (`tamper`: a wrong signature; `age`: seconds in the past); returns the
     * HTTP status, the answer and the interaction's token
     */
    async interact(endpoint, payload, { tamper = false, age = 0 } = {}) {
      const token = `interaction-${secret()}`;
      const text = JSON.stringify({ token, ...payload });
      const timestamp = String(Math.floor(Date.now() / 1000) - age);
      let signature = crypto.sign(null, Buffer.from(timestamp + text), PRIVATE_KEY).toString('hex');
      if (tamper) signature = `${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
      interactions.set(token, { edits: [], followUps: [] });
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Signature-Ed25519': signature, 'X-Signature-Timestamp': timestamp },
        body: text,
      });
      const answerText = await response.text();
      let answer;
      try {
        answer = answerText ? JSON.parse(answerText) : undefined;
      } catch {
        answer = answerText;
      }
      const record = interactions.get(token);
      record.answer = answer;
      if (answer?.type === 4) record.original = { ...answer.data, id: snowflake() };
      return { status: response.status, answer, token };
    },
    close: () => new Promise(resolve => {
      server.closeAllConnections();
      server.close(resolve);
    }),
  };
}

module.exports = { startFakeDiscord, PORT, INTERACTIONS_PUBLIC_KEY };
