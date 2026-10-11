import { Meteor } from 'meteor/meteor';

/*
 * A local stand-in for Discord's webhook API, for the tests: never Discord
 * itself. It keeps the messages it was sent and the threads of its forums,
 * and answers as Discord did on 2026-10-10 (tools/discord/probe): a username
 * with "discord" or "clyde" refused (50035); a Components V2 message without
 * ?with_components refused as empty (50006); in a forum, a message needs
 * thread_name or thread_id (220001), not both (220002); thread_name refused
 * outside a forum (220003); an unknown thread (10003) or message (10008).
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
 *
 * And the interactions (phase C): `interact` sends one to the app's endpoint,
 * signed with a test Ed25519 key pair whose public key (`publicKey`) the app
 * is given; the client credentials token and the global commands' overwrite;
 * the interaction's own webhook, whose original message and follow-ups it
 * keeps (`interactions`).
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
  // What the fake answered
  status?: number,
};

type Reply = { status: number, headers?: Record<string, string>, body?: unknown, delayMs?: number };

// What each webhook posts into: a text channel unless named
export type FakeChannels = Record<string, 'text' | 'forum' | 'gone'>;

const IS_COMPONENTS_V2 = 1 << 15;
const error = (status: number, code: number, message: string, errors?: unknown): Reply => ({
  status, headers: { 'Content-Type': 'application/json' }, body: { code, message, ...errors ? { errors } : {} },
});

// What the next authorization gives: the user's choice, who they are on
// Discord, the server and channel they pick
export type FakeAuthorization = {
  deny?: boolean,
  // What prompt=none answers when the user never authorized the application
  silentError?: string,
  user?: { id: string, username: string, global_name?: string },
  guildId?: string,
  channelId?: string,
};

type Grant = { scope: string, redirectUri: string, clientId: string, used: boolean, authorization: FakeAuthorization };
type FakeWebhook = { id: string, token: string, type: 1, application_id: string, channel_id: string, guild_id: string, name: string };

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
  // Threads a user made in a text channel: their channel, and whether they
  // still take messages (Discord's codes for the others are unknown: these
  // are plausible ones, which DiceCloud must not count on)
  const textThreads = new Map<string, { parent: string, state: 'open' | 'archived' | 'locked' | 'deleted' }>();
  let next = BigInt('1300000000000000000');
  const snowflake = () => String(next++);
  const secret = () => `${snowflake()}-${Math.random().toString(36).slice(2)}`;
  const channelOf = (webhookId: string) => oauthWebhooks.get(webhookId)?.channel_id ?? `9${webhookId.slice(1)}`;

  // OAuth2
  let authorization: FakeAuthorization = {
    user: { id: '1400000000000000001', username: 'aria_player', global_name: 'Aria' },
    guildId: '1500000000000000001',
    channelId: '1500000000000000002',
  };
  const grants = new Map<string, Grant>();
  const accessTokens = new Map<string, { scope: string, user?: FakeAuthorization['user'], revoked?: boolean }>();
  const oauthWebhooks = new Map<string, FakeWebhook>();
  const clientCredentials: { id?: string, secret?: string }[] = [];
  // Interactions: the key pair they are signed with, the commands registered,
  // and, per interaction token, its answer, original message and follow-ups
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = Meteor.isServer ? require('node:crypto') : undefined;
  const keys = crypto?.generateKeyPairSync('ed25519');
  const publicKey: string = keys?.publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
  const registeredCommands = new Map<string, unknown[]>();
  type InteractionRecord = { answer?: any, original?: any, edits: any[], followUps: any[], ephemeral: boolean };
  const interactions = new Map<string, InteractionRecord>();
  // The authorizations users gave: application, user, scope
  const consents = new Set<string>();
  const consentOf = (clientId: string, userId: string | undefined, scope: string) => `${clientId}|${userId}|${scope}`;

  function authorize(url: URL): Reply {
    const redirect = url.searchParams.get('redirect_uri') || '';
    const target = new URL(redirect);
    const state = url.searchParams.get('state');
    if (state) target.searchParams.set('state', state);
    const scope = url.searchParams.get('scope') || '';
    const clientId = url.searchParams.get('client_id') || '';
    const consent = consentOf(clientId, authorization.user?.id, scope);
    if (authorization.deny) {
      target.searchParams.set('error', 'access_denied');
      target.searchParams.set('error_description', 'The resource owner or authorization server denied the request');
    } else if (url.searchParams.get('prompt') === 'none' && !consents.has(consent)) {
      target.searchParams.set('error', authorization.silentError || 'consent_required');
    } else {
      const code = secret();
      grants.set(code, { scope, redirectUri: redirect, clientId, used: false, authorization: { ...authorization } });
      consents.add(consent);
      target.searchParams.set('code', code);
    }
    return { status: 302, headers: { Location: target.href } };
  }

  function exchange(request: FakeRequest, basic?: { id?: string, secret?: string }): Reply {
    clientCredentials.push(basic || {});
    const form = request.body || {};
    // The application's own token (client credentials grant)
    if (form.grant_type === 'client_credentials') {
      if (!basic?.id || !basic.secret) return error(401, 0, '401: Unauthorized');
      const access = secret();
      accessTokens.set(access, { scope: form.scope || '', application: basic.id } as any);
      return {
        status: 200, headers: { 'Content-Type': 'application/json' },
        body: { token_type: 'Bearer', access_token: access, expires_in: 604800, scope: form.scope || '' },
      };
    }
    const grant = grants.get(form.code);
    if (!basic?.id || !basic.secret) return error(401, 0, '401: Unauthorized');
    if (form.grant_type !== 'authorization_code' || !grant || grant.used || grant.redirectUri !== form.redirect_uri
      || grant.clientId !== basic.id) {
      return { status: 400, headers: { 'Content-Type': 'application/json' }, body: { error: 'invalid_grant' } };
    }
    grant.used = true;
    const access = secret();
    const body: Record<string, unknown> = {
      token_type: 'Bearer', access_token: access, expires_in: 604800, refresh_token: secret(),
      scope: grant.scope === 'webhook.incoming' ? '' : grant.scope,
    };
    if (grant.scope.split(' ').includes('webhook.incoming')) {
      const channelId = grant.authorization.channelId || snowflake();
      const inChannel = [...oauthWebhooks.values()].filter(w => w.channel_id === channelId
        && channels[w.id] !== 'gone').length;
      if (inChannel >= 15) return error(400, 30007, 'Maximum number of webhooks reached (15)');
      const webhook: FakeWebhook = {
        id: snowflake(), token: secret(), type: 1, application_id: basic.id, channel_id: channelId,
        guild_id: grant.authorization.guildId || snowflake(), name: 'DiceCloud',
      };
      oauthWebhooks.set(webhook.id, webhook);
      body.webhook = webhook;
    }
    accessTokens.set(access, { scope: grant.scope, user: grant.authorization.user });
    return { status: 200, headers: { 'Content-Type': 'application/json' }, body };
  }

  function me(authorizationHeader?: string): Reply {
    const token = accessTokens.get((authorizationHeader || '').replace(/^Bearer /, ''));
    if (!token || token.revoked || !token.scope.split(' ').includes('identify') || !token.user) {
      return error(401, 0, '401: Unauthorized');
    }
    return {
      status: 200, headers: { 'Content-Type': 'application/json' },
      body: { ...token.user, avatar: null, discriminator: '0' },
    };
  }

  function revoke(request: FakeRequest): Reply {
    const token = accessTokens.get(request.body?.token);
    if (token) token.revoked = true;
    // The user's authorization goes with it
    for (const consent of consents) if (token?.user && consent.split('|')[1] === token.user.id) consents.delete(consent);
    return { status: 200, headers: { 'Content-Type': 'application/json' }, body: {} };
  }

  // PUT /applications/<id>/commands, with a client credentials token for that application
  function overwriteCommands(applicationId: string, request: FakeRequest, authorization?: string): Reply {
    const token: any = accessTokens.get((authorization || '').replace(/^Bearer /, ''));
    if (!token || token.application !== applicationId || !String(token.scope).split(' ').includes('applications.commands.update')) {
      return error(401, 0, '401: Unauthorized');
    }
    const commands = (Array.isArray(request.body) ? request.body : []).map((command: any) => ({ ...command, id: snowflake(), application_id: applicationId }));
    registeredCommands.set(applicationId, commands);
    return { status: 200, headers: { 'Content-Type': 'application/json' }, body: commands };
  }

  // The webhook of an interaction: its original message edited, follow-ups posted
  function interactionWebhook(request: FakeRequest, token: string, original: boolean): Reply {
    const record = interactions.get(token) as InteractionRecord;
    const message = { ...request.body, id: record.original?.id || snowflake(), channel_id: 'interaction' };
    if (original && request.method === 'PATCH') {
      record.original = { ...record.original, ...message };
      record.edits.push(request.body);
      return { status: 200, headers: { 'Content-Type': 'application/json' }, body: record.original };
    }
    if (!original && request.method === 'POST') {
      const followUp = { ...request.body, id: snowflake() };
      record.followUps.push(followUp);
      return { status: 200, headers: { 'Content-Type': 'application/json' }, body: followUp };
    }
    return error(405, 0, '405: Method Not Allowed');
  }

  // GET or DELETE a webhook with its token
  function webhookItself(request: FakeRequest, token: string): Reply {
    const webhook = oauthWebhooks.get(request.webhookId);
    if (channels[request.webhookId] === 'gone' || (webhook && webhook.token !== token)) {
      return error(404, 10015, 'Unknown Webhook');
    }
    if (request.method === 'DELETE') {
      channels[request.webhookId] = 'gone';
      return { status: 204 };
    }
    return {
      status: 200, headers: { 'Content-Type': 'application/json' },
      // A pasted webhook: in its channel of the fake's server
      body: webhook ?? { id: request.webhookId, type: 1, channel_id: channelOf(request.webhookId), guild_id: '1500000000000000001', name: 'Pasted' },
    };
  }

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
      const closed = query.thread_id ? textThreads.get(query.thread_id) : undefined;
      if (closed && closed.state !== 'open') return closed.state === 'locked' ? error(403, 160005, 'Thread is locked') : error(400, 50083, 'Thread is archived');
      const message = request.messageId && messages.get(request.messageId);
      if (!message || (query.thread_id && message.channel_id !== query.thread_id)) {
        return error(404, 10008, 'Unknown Message');
      }
      Object.assign(message, body, { edited_timestamp: new Date().toISOString() });
      return { status: 200, headers: { 'Content-Type': 'application/json' }, body: message };
    }
    if (body?.thread_name && query.thread_id) return error(400, 220002, 'Cannot set both thread_name and thread_id');
    let channel = channelOf(request.webhookId);
    const textThread = query.thread_id ? textThreads.get(query.thread_id) : undefined;
    if (textThread) {
      if (textThread.state === 'deleted') return error(404, 10003, 'Unknown Channel');
      if (textThread.parent !== channel) return error(400, 50035, 'Invalid Form Body', { thread_id: { _errors: [{ code: 'THREAD_NOT_IN_CHANNEL' }] } });
      if (textThread.state === 'archived') return error(400, 50083, 'Thread is archived');
      if (textThread.state === 'locked') return error(403, 160005, 'Thread is locked');
      channel = query.thread_id as string;
    } else if (query.thread_id) {
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
      const interactionMatch = /^\/api\/v10\/webhooks\/(\d+)\/([\w.-]+)(\/messages\/@original)?$/.exec(url.pathname);
      const commandsMatch = /^\/api\/v10\/applications\/(\d+)\/commands$/.exec(url.pathname);
      const form = /x-www-form-urlencoded/.test(req.headers['content-type'] || '');
      const request: FakeRequest = {
        method: req.method,
        path: url.pathname,
        webhookId: match?.[1] || '',
        ...match?.[3] && { messageId: match[3] },
        query: Object.fromEntries(url.searchParams),
        userAgent: req.headers['user-agent'],
        body: !data ? undefined : form ? Object.fromEntries(new URLSearchParams(data)) : JSON.parse(data),
        at: Date.now(),
      };
      const basic = /^Basic (.+)$/.exec(req.headers.authorization || '')?.[1];
      const [id, password] = basic ? Buffer.from(basic, 'base64').toString().split(':') : [];
      let reply = override?.(request, requests.length);
      if (!reply) {
        if (interactionMatch && interactions.has(interactionMatch[2])) {
          reply = interactionWebhook(request, interactionMatch[2], !!interactionMatch[3]);
        } else if (req.method === 'PUT' && commandsMatch) reply = overwriteCommands(commandsMatch[1], request, req.headers.authorization);
        else if (req.method === 'GET' && url.pathname === '/oauth2/authorize') reply = authorize(url);
        else if (req.method === 'POST' && url.pathname === '/api/v10/oauth2/token') reply = exchange(request, basic ? { id, secret: password } : undefined);
        else if (req.method === 'POST' && url.pathname === '/api/v10/oauth2/token/revoke') reply = revoke(request);
        else if (req.method === 'GET' && url.pathname === '/api/v10/users/@me') reply = me(req.headers.authorization);
        else if (match && !match[3] && ['GET', 'DELETE'].includes(req.method)) reply = webhookItself(request, match[2]);
        else if (match) reply = answer(request);
        else reply = error(405, 0, '405: Method Not Allowed');
      }
      request.status = reply.status;
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
    /** What the next authorizations give */
    authorizeAs: (next: FakeAuthorization) => {
      authorization = next;
    },
    // The webhooks the authorizations created, the access tokens handed out,
    // the client credentials the exchanges came with
    oauthWebhooks,
    accessTokens,
    clientCredentials,
    // The authorizations users gave, `<client id>|<user id>|<scope>`
    consents,
    /** Removes a webhook, as a server's admin removing the integration would */
    removeWebhook: (id: string) => {
      channels[id] = 'gone';
    },
    /** The interactions' public key, which the app is given (hexadecimal) */
    publicKey,
    /** The commands each application registered */
    registeredCommands,
    /** Per interaction token: the app's answer, its original message and follow-ups */
    interactions,
    /**
     * Sends an interaction to the app's endpoint as Discord does, signed
     * (`tamper`: a wrong signature; `age`: seconds in the past), with a token
     * of its own; returns the HTTP status, the answer, and the token
     */
    async interact(endpoint: string, payload: Record<string, unknown>, { tamper = false, age = 0, unsigned = false } = {}) {
      const token = `interaction-${secret()}`;
      const body = JSON.stringify({ token, ...payload });
      const timestamp = String(Math.floor(Date.now() / 1000) - age);
      let signature = crypto.sign(null, Buffer.from(timestamp + body), keys.privateKey).toString('hex');
      if (tamper) signature = `${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
      interactions.set(token, { edits: [], followUps: [], ephemeral: false });
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...!unsigned && { 'X-Signature-Ed25519': signature, 'X-Signature-Timestamp': timestamp } },
        body,
      });
      const text = await response.text();
      let answer: any;
      try {
        answer = text ? JSON.parse(text) : undefined;
      } catch {
        answer = text;
      }
      const record = interactions.get(token) as InteractionRecord;
      record.answer = answer;
      record.ephemeral = !!(answer?.data?.flags & 64);
      if (answer?.type === 4) record.original = { ...answer.data, id: snowflake() };
      return { status: response.status, answer, token };
    },
    /** A thread a user makes in a webhook's text channel (or another channel's); returns its id */
    createThread: (channelId: string) => {
      const id = snowflake();
      textThreads.set(id, { parent: channelId, state: 'open' });
      return id;
    },
    /** A thread archived, locked or deleted in Discord */
    closeThread: (id: string, state: 'archived' | 'locked' | 'deleted') => {
      const thread = textThreads.get(id);
      if (thread) thread.state = state;
    },
    /** The channel a webhook posts in */
    channelOf,
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
