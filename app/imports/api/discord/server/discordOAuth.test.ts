import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { DDP } from 'meteor/ddp';
import { Accounts } from 'meteor/accounts-base';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import CreatureLogs, { insertCreatureLogWork } from '/imports/api/creature/log/CreatureLogs';
import {
  createWebhookSender, discordIntakeIdle, forgetWebhook, setWebhookSender, type WebhookSender,
} from '/imports/api/creature/log/server/discordWebhooks';
import { fakeDiscord, type FakeDiscord } from '/imports/api/creature/log/server/fakeDiscord.testFn';
import { turnLine } from '/imports/api/creature/log/discord/partyMessages';
import VERSION from '/imports/constants/VERSION';
import { nonceCookieName } from '/imports/api/discord/discordNonce';

/*
 * Phase B against the local fake of Discord (fakeDiscord.testFn.ts): "Connect
 * to Discord" (D4), "Link my Discord account" and "Sign in with Discord"
 * (D5), and the mentions. Each authorization goes the browser's way: a nonce
 * drawn, the method's address, the fake's authorization page, its redirect
 * to this server's callback (with the nonce's cookie for connect and link),
 * the callback's redirect to the page, or to Discord's page again. The
 * tokens are sealed with a key of the tests (secretCipher.ts).
 */

if (Meteor.isServer) describe('Discord\'s OAuth2: connect, link, sign in (phase B)', function () {
  this.timeout(30000);
  /* eslint-disable @typescript-eslint/no-require-imports */
  // The callback route, the login handler and the methods: unit tests load no entry point
  require('/imports/api/discord/server/oauthCallback');
  require('/imports/api/creature/creatures/server/publications/singleCharacter');
  require('/imports/api/creature/creatures/server/publications/characterList');
  require('/imports/api/users/server/publications/ownedDocuments');
  require('/imports/api/creature/creatureFolders/server/publications/partyBoard');
  const methods = require('/imports/api/discord/methods/discordOAuthMethods');
  const { setOAuthConfig } = require('/imports/api/discord/server/oauthClient');
  const { setTokenKeys, openSecret } = require('/imports/api/discord/server/secretCipher');
  const { createHash } = require('node:crypto');
  const { DiscordOAuthStates } = require('/imports/api/discord/server/oauthStates');
  const { ConnectedWebhooks } = require('/imports/api/creature/log/server/connectedWebhooks');
  const { mentionOf } = require('/imports/api/creature/log/server/discordInitiative');
  /* eslint-enable @typescript-eslint/no-require-imports */

  let fake: FakeDiscord;
  let sender: WebhookSender;
  let previousSender: WebhookSender | undefined;
  let previousConfig: unknown;
  let restoreKeys: () => void;
  const CLIENT_ID = '1600000000000000001';
  const [gmId, memberId, strangerId, readerId, creatureId, folderId] = getIds(6);
  const userIds = [gmId, memberId, strangerId, readerId];

  function getIds(count: number) {
    return Array.from({ length: count }, () => Random.id());
  }

  const call = (method: any, userId: string | undefined, args: any = {}) => method._execute({ userId }, args);

  beforeEach(async function () {
    fake = await fakeDiscord();
    sender = createWebhookSender({ baseUrl: fake.baseUrl, onGone: forgetWebhook });
    previousSender = setWebhookSender(sender);
    previousConfig = setOAuthConfig({
      clientId: CLIENT_ID, clientSecret: 'test-secret', apiBase: fake.baseUrl,
      redirectUri: Meteor.absoluteUrl('discord/oauth/callback'),
    });
    restoreKeys = setTokenKeys(Buffer.alloc(32, 9).toString('base64'));
    await Meteor.users.rawCollection().insertMany(userIds.map((_id, i) => ({
      _id, createdAt: new Date(), username: `discord-oauth-${i}-${_id}`,
    })) as any[]);
    await Creatures.rawCollection().insertOne({
      _id: creatureId, name: 'Aria', type: 'pc', owner: memberId, writers: [gmId], readers: [readerId],
      computeVersion: VERSION, settings: {},
    } as any);
    await CreatureFolders.rawCollection().insertOne({
      _id: folderId, name: 'The table', owner: gmId, members: [memberId], creatures: [creatureId], order: 0,
    } as any);
  });

  afterEach(async function () {
    await discordIntakeIdle();
    await sender.idle();
    setWebhookSender(previousSender);
    setOAuthConfig(previousConfig as any);
    restoreKeys();
    await fake.close();
    await Promise.all([
      Meteor.users.removeAsync({ _id: { $in: userIds } }),
      Creatures.removeAsync(creatureId),
      CreatureFolders.removeAsync(folderId),
      CreatureLogs.removeAsync({ creatureId }),
      ConnectedWebhooks.removeAsync({}),
      DiscordOAuthStates.removeAsync({}),
    ]);
  });

  type Started = { url: string, nonce: string, cookie: string };

  /**
   * What the browser does first: draws a nonce, keeps it (a cookie that only
   * the callback receives, for connect and link; localStorage for sign in),
   * and asks the method for Discord's address with the nonce's hash
   */
  async function begin(method: any, userId: string | undefined, args: any = {}): Promise<Started> {
    const nonce = Random.secret(43);
    const nonceHash = createHash('sha256').update(nonce).digest('hex');
    const url = await call(method, userId, { ...args, nonceHash });
    return { url, nonce, cookie: `${nonceCookieName(nonceHash)}=${nonce}` };
  }

  /**
   * What the browser does with the address: Discord's page (the fake's),
   * which redirects to the callback, which redirects to a page of the app, or
   * to Discord's page again. Returns that page's path and query, the last
   * callback's address, and Discord's pages seen
   */
  async function authorize(started: Started | string, { cookie = typeof started === 'string' ? '' : started.cookie } = {}) {
    let next = typeof started === 'string' ? started : started.url;
    const pages: URL[] = [];
    for (;;) {
      pages.push(new URL(next));
      const fromDiscord = await fetch(next, { redirect: 'manual' });
      assert.equal(fromDiscord.status, 302);
      const callback = fromDiscord.headers.get('location') as string;
      assert.isTrue(callback.startsWith(Meteor.absoluteUrl('discord/oauth/callback')), callback);
      const back = await follow(callback, cookie);
      if (back.location.href.startsWith(Meteor.absoluteUrl())) return { ...back, pages };
      // Discord's page again: never more than twice
      assert.isBelow(pages.length, 2, 'Discord\'s page twice at most');
      next = back.location.href;
    }
  }
  async function follow(callback: string, cookie = '') {
    const back = await fetch(callback, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
    assert.equal(back.status, 302);
    assert.equal(back.headers.get('referrer-policy'), 'no-referrer');
    const location = new URL(back.headers.get('location') as string);
    return {
      path: location.pathname, query: Object.fromEntries(location.searchParams), callback, location,
      setCookie: back.headers.get('set-cookie') || '',
    };
  }
  /** Signs in with a ticket and a nonce, on a connection of its own; the user id, or the error */
  async function signIn(ticket: string | undefined, nonce?: string) {
    const connection = DDP.connect(Meteor.absoluteUrl());
    try {
      const login = await connection.callAsync('login', { discordTicket: ticket, ...nonce !== undefined && { discordNonce: nonce } }) as any;
      return { userId: login.id as string };
    } catch (e) {
      return { error: (e as Meteor.Error).error };
    } finally {
      connection.disconnect();
    }
  }
  // Requests of the kind, to the fake
  const revocations = () => fake.requests.filter(request => request.path === '/api/v10/oauth2/token/revoke');
  const creature = () => Creatures.findOneAsync(creatureId) as Promise<any>;
  const folder = () => CreatureFolders.findOneAsync(folderId) as Promise<any>;
  // Every document DiceCloud keeps about it, as stored
  async function stored() {
    return JSON.stringify(await Promise.all([
      Creatures.rawCollection().find({}).toArray(), CreatureFolders.rawCollection().find({}).toArray(),
      Meteor.users.rawCollection().find({ _id: { $in: userIds } }).toArray(),
      DiscordOAuthStates.rawCollection().find({}).toArray(),
    ]));
  }

  describe('Connect to Discord (D4)', function () {
    it('keeps the webhook on the server, points the character at it, drops the OAuth tokens', async function () {
      const started = await begin(methods.discordConnectUrl, memberId, { creatureId, returnTo: `/character/${creatureId}` });
      const url = new URL(started.url);
      assert.equal(url.pathname, '/oauth2/authorize');
      assert.equal(url.searchParams.get('scope'), 'webhook.incoming');
      assert.equal(url.searchParams.get('client_id'), CLIENT_ID);
      assert.equal(url.searchParams.get('redirect_uri'), Meteor.absoluteUrl('discord/oauth/callback'));
      assert.isNull(url.searchParams.get('prompt'), 'the channel is picked every time');
      const back = await authorize(started);
      assert.equal(back.path, `/character/${creatureId}`);
      assert.equal(back.query.discord, 'connected');
      assert.include(back.setCookie, `${started.cookie.split('=')[0]}=;`, 'the nonce\'s cookie, used, is cleared');
      assert.include(back.setCookie, 'Max-Age=0');
      const [webhook] = fake.oauthWebhooks.values();
      assert.deepInclude((await creature()).discordChannel, {
        webhookId: webhook.id, guildId: webhook.guild_id, channelId: webhook.channel_id,
      });
      // The token, on the server's collection alone, sealed; never an OAuth token
      const kept = (await ConnectedWebhooks.findOneAsync({ webhookId: webhook.id }))?.token;
      assert.match(kept, /^enc1\./);
      assert.equal(openSecret(kept), webhook.token);
      const everything = await stored() + JSON.stringify(await ConnectedWebhooks.find().fetchAsync());
      assert.notInclude(everything, webhook.token);
      for (const token of fake.accessTokens.keys()) assert.notInclude(everything, token);
      assert.lengthOf(await DiscordOAuthStates.find().fetchAsync(), 0, 'the state is used up');
      assert.lengthOf(revocations(), 0, 'dropped, not revoked: the webhook would not mind');
      // Its log posts with the connected webhook
      await insertCreatureLogWork({ log: { creatureId, content: [{ value: '1d20' }, { value: '1d20 [7]' }, { value: '7' }] } });
      await discordIntakeIdle();
      await sender.idle();
      const posted = fake.requests.filter(request => request.method === 'POST' && request.webhookId === webhook.id);
      assert.lengthOf(posted, 1);
      assert.equal(posted[0].path, `/api/v10/webhooks/${webhook.id}/${webhook.token}`);
      assert.equal(posted[0].body.username, 'Aria', 'under the character\'s name');
    });

    it('takes a state once, before it expires, and checks the rights again on the way back', async function () {
      // Used twice
      const started = await begin(methods.discordConnectUrl, memberId, { creatureId });
      const first = await authorize(started);
      assert.equal(first.query.discord, 'connected');
      assert.equal((await follow(first.callback, started.cookie)).query.discord, 'expired');
      // Expired
      const late = await begin(methods.discordConnectUrl, memberId, { creatureId });
      await DiscordOAuthStates.rawCollection().updateOne({ _id: new URL(late.url).searchParams.get('state') as string },
        { $set: { createdAt: new Date(Date.now() - 11 * 60 * 1000) } });
      assert.equal((await authorize(late)).query.discord, 'expired');
      // Refused on Discord's page
      fake.authorizeAs({ deny: true });
      assert.equal((await authorize(await begin(methods.discordConnectUrl, memberId, { creatureId }))).query.discord, 'denied');
      fake.authorizeAs({ user: { id: '1', username: 'x' }, channelId: '1500000000000000099', guildId: '1500000000000000098' });
      // Rights gone meanwhile: the GM was a writer of the character
      const gmUrl = await begin(methods.discordConnectUrl, gmId, { creatureId });
      await Creatures.updateAsync(creatureId, { $set: { writers: [] } });
      const before = fake.oauthWebhooks.size;
      assert.equal((await authorize(gmUrl)).query.discord, 'forbidden');
      assert.equal(fake.oauthWebhooks.size, before, 'no code exchanged, no webhook made');
      // Never for someone who cannot edit it, nor for a board's player
      for (const [userId, args] of [[strangerId, { creatureId }], [readerId, { creatureId }], [memberId, { folderId }], [undefined, { creatureId }]] as const) {
        let refused = false;
        try {
          await begin(methods.discordConnectUrl, userId as any, args);
        } catch {
          refused = true;
        }
        assert.isTrue(refused, `${userId} ${JSON.stringify(args)}`);
      }
    });

    it('connects and links only in the browser that started it (the nonce\'s cookie)', async function () {
      const before = fake.oauthWebhooks.size;
      for (const [method, userId, args] of [
        [methods.discordConnectUrl, memberId, { creatureId }],
        [methods.discordLinkUrl, memberId, {}],
      ] as const) {
        // Someone else's address, sent to a user: their browser has no cookie,
        // or the cookie of another authorization
        const another = await begin(method, userId, args);
        for (const cookieOf of [
          () => '',
          () => another.cookie,
          (started: Started) => `${started.cookie.split('=')[0]}=${another.nonce}`,
        ]) {
          const someoneElses = await begin(method, userId, args);
          const cookie = cookieOf(someoneElses);
          assert.equal((await authorize(someoneElses, { cookie })).query.discord, 'expired', `${method.name} with "${cookie}"`);
        }
      }
      assert.equal(fake.oauthWebhooks.size, before, 'no code exchanged, no webhook made');
      assert.notProperty(await creature(), 'discordChannel');
      assert.notProperty(await Meteor.users.findOneAsync(memberId), 'discordAccount');
      // And the methods want the nonce's hash
      for (const nonceHash of [undefined, 'not-a-hash']) {
        let refused;
        try {
          await call(methods.discordConnectUrl, memberId, { creatureId, nonceHash });
        } catch (e) {
          refused = e;
        }
        assert.exists(refused, `nonceHash ${nonceHash}`);
      }
    });

    it('keeps one webhook per channel, and deletes it from Discord once nothing posts with it', async function () {
      await authorize(await begin(methods.discordConnectUrl, memberId, { creatureId }));
      await authorize(await begin(methods.discordConnectUrl, gmId, { folderId }));
      const [kept, second] = fake.oauthWebhooks.values();
      assert.equal((await creature()).discordChannel.webhookId, kept.id);
      assert.equal((await folder()).discord.channel.webhookId, kept.id, 'the board points at the channel\'s webhook');
      assert.isTrue(fake.requests.some(request => request.method === 'DELETE' && request.webhookId === second.id), 'the new one deleted');
      assert.lengthOf(await ConnectedWebhooks.find().fetchAsync(), 1);
      assert.deepEqual((await folder()).discordPosting, { rolls: true, combat: true }, 'the players are told');
      // One message for the character and its party: the same channel
      await insertCreatureLogWork({ log: { creatureId, content: [{ value: '1d20' }, { value: '1d20 [7]' }, { value: '7' }] } });
      await discordIntakeIdle();
      await sender.idle();
      assert.lengthOf(fake.requests.filter(request => request.method === 'POST' && request.path.startsWith('/api/v10/webhooks/')), 1);

      await call(methods.discordDisconnect, memberId, { creatureId });
      assert.notProperty(await creature(), 'discordChannel');
      assert.isFalse(fake.requests.some(request => request.method === 'DELETE' && request.webhookId === kept.id), 'the board still uses it');
      await call(methods.discordDisconnect, gmId, { folderId });
      assert.notProperty((await folder()).discord ?? {}, 'channel');
      assert.isTrue(fake.requests.some(request => request.method === 'DELETE' && request.webhookId === kept.id));
      assert.lengthOf(await ConnectedWebhooks.find().fetchAsync(), 0);
    });

    it('replaces a channel\'s webhook that Discord no longer knows', async function () {
      await authorize(await begin(methods.discordConnectUrl, memberId, { creatureId }));
      const [old] = fake.oauthWebhooks.values();
      fake.removeWebhook(old.id);
      await authorize(await begin(methods.discordConnectUrl, gmId, { folderId }));
      const latest = [...fake.oauthWebhooks.values()].at(-1);
      assert.equal((await folder()).discord.channel.webhookId, latest?.id);
      assert.equal((await creature()).discordChannel.webhookId, latest?.id, 'the character follows');
    });

    it('says so when the channel has the 15 webhooks Discord allows (30007)', async function () {
      await fake.close();
      fake = await fakeDiscord({
        override: request => request.path === '/api/v10/oauth2/token'
          ? { status: 400, headers: { 'Content-Type': 'application/json' }, body: { code: 30007, message: 'Maximum number of webhooks reached (15)' } }
          : undefined,
      });
      setOAuthConfig({ clientId: CLIENT_ID, clientSecret: 'test-secret', apiBase: fake.baseUrl, redirectUri: Meteor.absoluteUrl('discord/oauth/callback') });
      assert.equal((await authorize(await begin(methods.discordConnectUrl, memberId, { creatureId }))).query.discord, 'full');
      assert.notProperty(await creature(), 'discordChannel');
    });

    it('forgets a connected webhook that answers 404 (an admin removed the integration)', async function () {
      await authorize(await begin(methods.discordConnectUrl, memberId, { creatureId }));
      const [webhook] = fake.oauthWebhooks.values();
      fake.removeWebhook(webhook.id);
      await insertCreatureLogWork({ log: { creatureId, content: [{ value: '1d20' }, { value: '1d20 [7]' }, { value: '7' }] } });
      await discordIntakeIdle();
      await sender.idle();
      assert.notProperty(await creature(), 'discordChannel');
      assert.lengthOf(await ConnectedWebhooks.find().fetchAsync(), 0);
    });

    it('never sends a connected webhook\'s token to any client, its owner included', async function () {
      await authorize(await begin(methods.discordConnectUrl, memberId, { creatureId }));
      await authorize(await begin(methods.discordConnectUrl, gmId, { folderId }));
      const [webhook] = fake.oauthWebhooks.values();
      const frames: string[] = [];
      for (const [userId, subscriptions] of [
        [memberId, [['singleCharacter', creatureId], ['characterList'], ['partyBoard', folderId]]],
        [gmId, [['partyBoard', folderId], ['singleCharacter', creatureId], ['characterList']]],
        [readerId, [['singleCharacter', creatureId]]],
      ] as const) {
        const connection = DDP.connect(Meteor.absoluteUrl());
        (connection as any)._stream.on('message', (message: string) => frames.push(message));
        try {
          const accounts = Accounts as any;
          const stamped = accounts._generateStampedLoginToken();
          await accounts._insertLoginToken(userId, stamped);
          await connection.callAsync('login', { resume: stamped.token });
          for (const [name, ...args] of subscriptions) {
            await new Promise((resolve, reject) => connection.subscribe(name, ...args, {
              onReady: resolve, onStop: (error: unknown) => error && reject(error),
            }));
          }
          await new Promise(resolve => setTimeout(resolve, 300));
        } finally {
          connection.disconnect();
        }
      }
      const all = frames.join('\n');
      assert.include(all, webhook.id, 'the channel reaches its editors: the search proves something');
      assert.notInclude(all, webhook.token);
      for (const token of fake.accessTokens.keys()) assert.notInclude(all, token);
    });
  });

  describe('Link my Discord account, sign in with Discord (D5)', function () {
    const PLAYER = { id: '1400000000000000042', username: 'aria_player', global_name: 'Aria' };

    it('keeps the Discord id and name alone, drops the token without revoking it, one DiceCloud account each', async function () {
      fake.authorizeAs({ user: PLAYER });
      const started = await begin(methods.discordLinkUrl, memberId, {});
      assert.isNull(new URL(started.url).searchParams.get('prompt'));
      const back = await authorize(started);
      assert.deepEqual([back.path, back.query.discord], ['/account', 'linked']);
      const user = await Meteor.users.findOneAsync(memberId) as any;
      assert.equal(user.discordAccount.id, PLAYER.id);
      assert.equal(user.discordAccount.username, 'Aria');
      assert.deepEqual(Object.keys(user.discordAccount).sort(), ['id', 'linkedAt', 'username']);
      assert.lengthOf(revocations(), 0, 'dropped, not revoked');
      assert.isTrue(fake.consents.has(`${CLIENT_ID}|${PLAYER.id}|identify`), 'the authorization stays, for the one-click sign in');
      const everything = await stored();
      for (const token of fake.accessTokens.keys()) assert.notInclude(everything, token);
      // The same Discord account, another DiceCloud account
      const taken = await authorize(await begin(methods.discordLinkUrl, strangerId, {}));
      assert.equal(taken.query.discord, 'taken');
      assert.notProperty(await Meteor.users.findOneAsync(strangerId), 'discordAccount');
      await call(methods.discordUnlink, memberId);
      assert.notProperty(await Meteor.users.findOneAsync(memberId), 'discordAccount');
    });

    // A sign-in through Discord, as far as the ticket: with its nonce
    async function ticketFor(returnTo = '/party/x') {
      const started = await begin(methods.discordLoginUrl, undefined, { returnTo });
      const back = await authorize(started);
      return { ...back, nonce: started.nonce, ticket: back.query.ticket };
    }

    it('signs in an account already linked in one click, with a one-time ticket; never creates one', async function () {
      const users = await Meteor.users.find().countAsync();
      fake.authorizeAs({ user: { id: '1400000000000000077', username: 'nobody' } });
      // Never authorized: Discord asks once (prompt=none, then its page)
      const unknown = await ticketFor();
      assert.deepEqual([unknown.path, unknown.query.discord, unknown.query.redirect], ['/sign-in', 'unknown', '/party/x']);
      assert.equal(await Meteor.users.find().countAsync(), users, 'no account created');

      fake.authorizeAs({ user: PLAYER });
      await authorize(await begin(methods.discordLinkUrl, memberId, {}));
      const linked = await ticketFor();
      assert.deepEqual([linked.path, linked.query.discord, linked.query.redirect], ['/sign-in', 'ticket', '/party/x']);
      assert.lengthOf(linked.pages, 1, 'one click: no page of Discord\'s');
      assert.equal(linked.pages[0].searchParams.get('prompt'), 'none');
      assert.deepEqual(await signIn(linked.ticket, linked.nonce), { userId: memberId });
      assert.deepEqual(await signIn(linked.ticket, linked.nonce), { error: 'discord-sign-in-expired' }, 'a ticket signs in once');
      assert.lengthOf(revocations(), 0);
    });

    it('signs in only the browser that started it: the ticket wants its nonce', async function () {
      fake.authorizeAs({ user: PLAYER });
      await authorize(await begin(methods.discordLinkUrl, memberId, {}));
      const expired = { error: 'discord-sign-in-expired' };
      // Without the nonce, with a wrong one
      assert.deepEqual(await signIn((await ticketFor()).ticket), expired);
      assert.deepEqual(await signIn((await ticketFor()).ticket, Random.secret(43)), expired);
      assert.deepEqual(await signIn((await ticketFor()).ticket, ''), expired);
      // A ticket of one browser, redeemed with the nonce of another, which
      // started a sign-in of its own (a ticket sent to someone else)
      const first = await ticketFor();
      const second = await ticketFor();
      assert.deepEqual(await signIn(first.ticket, second.nonce), expired);
      assert.deepEqual(await signIn(second.ticket, first.nonce), expired, 'and each is taken once tried');
      // Its own nonce
      const own = await ticketFor();
      assert.deepEqual(await signIn(own.ticket, own.nonce), { userId: memberId });
      // A callback's address, sent to another browser: its ticket is bound to the nonce of the first
      const started = await begin(methods.discordLoginUrl, undefined, {});
      const fromDiscord = await fetch(started.url, { redirect: 'manual' });
      const elsewhere = await follow(fromDiscord.headers.get('location') as string);
      assert.equal(elsewhere.query.discord, 'ticket');
      assert.deepEqual(await signIn(elsewhere.query.ticket, Random.secret(43)), expired);
      assert.lengthOf(await DiscordOAuthStates.find({ kind: 'ticket' }).fetchAsync(), 0, 'every ticket used up');
    });

    it('starts again once with Discord\'s page when prompt=none is answered with anything but a refusal', async function () {
      fake.authorizeAs({ user: PLAYER });
      await authorize(await begin(methods.discordLinkUrl, memberId, {}));
      // The authorization removed in Discord's Authorized Apps meanwhile
      fake.consents.clear();
      const again = await ticketFor();
      assert.equal(again.query.discord, 'ticket');
      assert.deepEqual(again.pages.map(page => page.searchParams.get('prompt')), ['none', null]);
      assert.deepEqual(await signIn(again.ticket, again.nonce), { userId: memberId });
      // Refused on Discord: no second try
      fake.consents.clear();
      fake.authorizeAs({ user: PLAYER, deny: true });
      const refused = await ticketFor();
      assert.deepEqual([refused.path, refused.query.discord], ['/sign-in', 'denied']);
      assert.lengthOf(refused.pages, 1);
    });

    it('starts again only once: a second error says so', async function () {
      await fake.close();
      fake = await fakeDiscord({
        override: request => request.path === '/oauth2/authorize' ? {
          status: 302,
          headers: { Location: `${request.query.redirect_uri}?state=${request.query.state}&error=server_error` },
        } : undefined,
      });
      setOAuthConfig({ clientId: CLIENT_ID, clientSecret: 'test-secret', apiBase: fake.baseUrl, redirectUri: Meteor.absoluteUrl('discord/oauth/callback') });
      const failed = await ticketFor();
      assert.deepEqual([failed.path, failed.query.discord], ['/sign-in', 'error']);
      assert.deepEqual(failed.pages.map(page => page.searchParams.get('prompt')), ['none', null]);
    });
  });

  describe('Pasted webhooks, sealed', function () {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { setCharacterWebhook } = require('/imports/api/creature/creatures/methods/discordSessionMethods');
    const { setPartyWebhook } = require('/imports/api/creature/creatureFolders/methods/discordMethods');
    const updateCreature = require('/imports/api/creature/creatures/methods/updateCreature').default;
    /* eslint-enable @typescript-eslint/no-require-imports */
    const own = { id: '1200000000000000011', token: 'own-pasted-token' };
    const party = { id: '1200000000000000022', token: 'party-pasted-token' };
    const url = (webhook: { id: string, token: string }) => `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`;

    it('stores the URL sealed beside its webhook\'s id; the editors get the id, no client the URL; it still posts', async function () {
      await call(setCharacterWebhook, memberId, { creatureId, webhook: url(own) });
      await call(setPartyWebhook, gmId, { folderId, webhook: url(party) });
      const stored = await Creatures.rawCollection().findOne({ _id: creatureId }) as any;
      assert.match(stored.settings.discordWebhook, /^enc1\./);
      assert.equal(stored.discordWebhookId, own.id);
      const storedFolder = await CreatureFolders.rawCollection().findOne({ _id: folderId }) as any;
      assert.match(storedFolder.discord.webhook, /^enc1\./);
      assert.equal(storedFolder.discord.webhookId, party.id);
      assert.notInclude(JSON.stringify([stored, storedFolder]), 'pasted-token');
      // Never through the generic update, which would store it as it is
      let refused;
      try {
        await call(updateCreature, memberId, {
          _id: creatureId, path: ['settings', 'discordWebhook'], value: url(own),
        });
      } catch (e) {
        refused = e;
      }
      assert.exists(refused);
      // Its log posts to both, with the tokens opened
      await insertCreatureLogWork({ log: { creatureId, content: [{ value: '1d20' }, { value: '1d20 [7]' }, { value: '7' }] } });
      await discordIntakeIdle();
      await sender.idle();
      const posted = fake.requests.filter(request => request.method === 'POST').map(request => request.path);
      assert.includeMembers(posted, [`/api/v10/webhooks/${own.id}/${own.token}`, `/api/v10/webhooks/${party.id}/${party.token}`]);

      const frames: string[] = [];
      for (const [userId, subscriptions] of [
        [memberId, [['singleCharacter', creatureId], ['ownedDocuments'], ['partyBoard', folderId]]],
        [gmId, [['partyBoard', folderId], ['singleCharacter', creatureId]]],
        [readerId, [['singleCharacter', creatureId]]],
      ] as const) {
        const connection = DDP.connect(Meteor.absoluteUrl());
        (connection as any)._stream.on('message', (message: string) => frames.push(message));
        try {
          const accounts = Accounts as any;
          const stamped = accounts._generateStampedLoginToken();
          await accounts._insertLoginToken(userId, stamped);
          await connection.callAsync('login', { resume: stamped.token });
          for (const [name, ...args] of subscriptions) {
            await new Promise((resolve, reject) => connection.subscribe(name, ...args, {
              onReady: resolve, onStop: (error: unknown) => error && reject(error),
            }));
          }
          await new Promise(resolve => setTimeout(resolve, 300));
        } finally {
          connection.disconnect();
        }
      }
      const all = frames.join('\n');
      assert.include(all, own.id, 'the id reaches its editors: the search proves something');
      assert.include(all, party.id, 'and the party\'s its game master');
      for (const secret of [own.token, party.token, 'enc1.', stored.settings.discordWebhook, storedFolder.discord.webhook]) {
        assert.notInclude(all, secret);
      }

      // Removed: nothing left of it
      await call(setCharacterWebhook, memberId, { creatureId });
      const removed = await Creatures.rawCollection().findOne({ _id: creatureId }) as any;
      assert.notProperty(removed.settings, 'discordWebhook');
      assert.notProperty(removed, 'discordWebhookId');
      // A wrong URL is refused
      let invalid;
      try {
        await call(setCharacterWebhook, memberId, { creatureId, webhook: 'https://evil.example/api/webhooks/1/abc' });
      } catch (e) {
        invalid = e;
      }
      assert.exists(invalid);
    });
  });

  describe('Mentions', function () {
    it('mentions a player who linked their account on their turn, unless they turned it off', async function () {
      await Meteor.users.updateAsync(memberId, { $set: { discordAccount: { id: '1400000000000000042', username: 'Aria', linkedAt: new Date() } } });
      assert.equal(await mentionOf(memberId), '1400000000000000042');
      assert.isUndefined(await mentionOf(gmId), 'not linked: the name alone');
      const line = turnLine({ name: 'Aria', character: true }, 'fr', await mentionOf(memberId));
      assert.deepEqual(line, {
        content: 'À toi : Aria <@1400000000000000042>',
        allowed_mentions: { parse: [], users: ['1400000000000000042'] },
      });
      assert.deepEqual(turnLine({ name: 'Goblin 1' }, 'en', '1400000000000000042')?.allowed_mentions, { parse: [] },
        'never on a monster\'s turn');
      await Meteor.users.updateAsync(memberId, { $set: { 'preferences.discordMentionOff': true } });
      assert.isUndefined(await mentionOf(memberId));
      assert.deepEqual(turnLine({ name: 'Aria', character: true }, 'en', await mentionOf(memberId)),
        { content: 'Your turn: Aria', allowed_mentions: { parse: [] } });
    });
  });
});
