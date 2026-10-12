import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import CreatureLogs, { insertCreatureLogWork } from '/imports/api/creature/log/CreatureLogs';
import {
  createWebhookSender, discordIntakeIdle, forgetWebhook, setWebhookSender, type WebhookSender,
} from '/imports/api/creature/log/server/discordWebhooks';
import { initiativeIntakeIdle } from '/imports/api/creature/log/server/discordInitiative';
import { rollInitiative } from '/imports/api/creature/creatureFolders/methods/initiativeMethods';
import { startPartySession, setPartyWebhook } from '/imports/api/creature/creatureFolders/methods/discordMethods';
import { startCharacterSession } from '/imports/api/creature/creatures/methods/discordSessionMethods';
import { fakeDiscord, type FakeDiscord } from '/imports/api/creature/log/server/fakeDiscord.testFn';

/*
 * Phase D: the bot, by HTTP alone. /connect connects a text channel or a
 * forum (run in one of its posts) to a party or a character, with all its
 * checks, through a webhook the bot creates, one per channel; a forum so
 * connected has its sessions as posts, with the buttons; "New session" in a
 * text channel connected for that holder has the bot create the thread, and
 * says to add the bot when it cannot.
 */

if (Meteor.isServer) describe('Discord\'s bot: /connect and new threads (phase D)', function () {
  this.timeout(30000);
  /* eslint-disable @typescript-eslint/no-require-imports */
  require('/imports/api/discord/server/interactions/interactionsEndpoint');
  const { setInteractionsPublicKey } = require('/imports/api/discord/server/interactions/interactionSignature');
  const { setOAuthConfig } = require('/imports/api/discord/server/oauthClient');
  const { setBotToken, BOT_PERMISSION_INTEGER } = require('/imports/api/discord/server/botClient');
  const { resetInteractionLimits } = require('/imports/api/discord/server/interactions/interactionsEndpoint');
  const { ConnectedWebhooks } = require('/imports/api/creature/log/server/connectedWebhooks');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const APP = '1600000000000000001';
  const GUILD = '1500000000000000001';
  const TEXT = '1510000000000000001';
  const FORUM = '1510000000000000002';
  const POST = '1510000000000000003';
  const DENIED = '1510000000000000004';
  const ABSENT = '1510000000000000005';
  const OTHER_TEXT = '1510000000000000006';
  const [GM, PLAYER, MEMBER, STRANGER] = ['1400000000000000071', '1400000000000000072', '1400000000000000073', '1400000000000000099'];
  const [gmId, playerId, memberId, folderId, creatureId] = Array.from({ length: 5 }, () => Random.id());
  const MANAGE = String((BigInt(1) << BigInt(10)) | (BigInt(1) << BigInt(29)));
  const ORDINARY = String((BigInt(1) << BigInt(10)) | (BigInt(1) << BigInt(11)));

  let fake: FakeDiscord;
  let sender: WebhookSender;
  let previous: { sender?: WebhookSender, config?: unknown, key?: unknown, bot?: unknown } = {};
  const endpoint = () => Meteor.absoluteUrl('discord/interactions');
  const call = (method: any, userId: string, args: any) => method._execute({ userId }, args);

  beforeEach(async function () {
    fake = await fakeDiscord({
      botChannels: {
        [TEXT]: { type: 0, guildId: GUILD },
        [OTHER_TEXT]: { type: 0, guildId: GUILD },
        [FORUM]: { type: 15, guildId: GUILD },
        [POST]: { type: 11, guildId: GUILD, parentId: FORUM },
        [DENIED]: { type: 0, guildId: GUILD },
      },
      botDenied: [DENIED],
      botAbsent: [ABSENT],
    });
    sender = createWebhookSender({ baseUrl: fake.baseUrl, onGone: forgetWebhook });
    previous = {
      sender: setWebhookSender(sender),
      config: setOAuthConfig({ clientId: APP, clientSecret: 'test-secret', apiBase: fake.baseUrl, redirectUri: Meteor.absoluteUrl('discord/oauth/callback') }),
      key: setInteractionsPublicKey(fake.publicKey),
      bot: setBotToken('fake-bot-token'),
    };
    resetInteractionLimits();
    await Meteor.users.rawCollection().insertMany([
      { _id: gmId, createdAt: new Date(), username: `bot-gm-${gmId}`, discordAccount: { id: GM, username: 'GM' }, preferences: { language: 'en' } },
      { _id: playerId, createdAt: new Date(), username: `bot-player-${playerId}`, discordAccount: { id: PLAYER, username: 'Aria' } },
      { _id: memberId, createdAt: new Date(), username: `bot-member-${memberId}`, discordAccount: { id: MEMBER, username: 'Member' } },
    ] as any[]);
    await Creatures.rawCollection().insertOne({
      _id: creatureId, name: 'Aria', type: 'pc', owner: playerId, readers: [], writers: [], settings: {},
    } as any);
    await CreatureFolders.rawCollection().insertOne({
      _id: folderId, name: 'The table', owner: gmId, members: [playerId], creatures: [creatureId], order: 0,
    } as any);
  });

  afterEach(async function () {
    await discordIntakeIdle();
    await initiativeIntakeIdle();
    await sender.idle();
    setWebhookSender(previous.sender);
    setOAuthConfig(previous.config as any);
    setInteractionsPublicKey(previous.key as any);
    setBotToken(previous.bot as any);
    await fake.close();
    await Promise.all([
      Meteor.users.removeAsync({ _id: { $in: [gmId, playerId, memberId] } }),
      Creatures.removeAsync(creatureId),
      CreatureFolders.removeAsync(folderId),
      CreatureLogs.removeAsync({ creatureId }),
      ConnectedWebhooks.removeAsync({}),
    ]);
  });

  type Where = { user?: string, channel?: { id: string, type: number, parent_id?: string }, member?: string, app?: string, guild?: string | null };
  function connect(target: string, { user = GM, channel = { id: TEXT, type: 0 }, member = MANAGE, app = String(BOT_PERMISSION_INTEGER), guild = GUILD }: Where = {}) {
    return fake.interact(endpoint(), {
      type: 2, application_id: APP, locale: 'en-US', channel_id: channel.id, channel, app_permissions: app,
      ...guild ? { guild_id: guild, member: { user: { id: user }, permissions: member } } : { user: { id: user } },
      data: { name: 'connect', options: [{ name: 'target', type: 3, value: target }] },
    });
  }
  async function waitFor<T>(condition: () => T | Promise<T>, what: string): Promise<T> {
    const end = Date.now() + 15000;
    for (;;) {
      const value = await condition();
      if (value) return value;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  const edited = (token: string) => waitFor(() => fake.interactions.get(token)?.edits.at(-1), 'the reply');
  const folder = async () => await CreatureFolders.findOneAsync(folderId) as any;
  const creature = async () => await Creatures.findOneAsync(creatureId) as any;
  const customIds = (bodies: unknown[]) => [...JSON.stringify(bodies).matchAll(/"custom_id":"([^"]+)"/g)].map(match => match[1]);
  const settle = async () => {
    await discordIntakeIdle();
    await initiativeIntakeIdle();
    await sender.idle();
  };

  it('/connect connects a text channel to a party, with a webhook the bot creates; one per channel', async function () {
    const { answer, token } = await connect(`folder:${folderId}`);
    assert.deepEqual(answer, { type: 5, data: { flags: 64 } }, 'deferred, for its user alone');
    assert.include((await edited(token)).content, 'Connected: The table now posts in this channel');
    const channel = (await folder()).discord.channel;
    assert.equal(channel.channelId, TEXT);
    assert.equal(channel.kind, 'text');
    assert.lengthOf(fake.botWebhooks, 1);
    assert.equal(channel.webhookId, fake.botWebhooks[0].id);
    const botRequest = fake.requests.find(request => request.path === `/api/v10/channels/${TEXT}/webhooks`);
    assert.equal(botRequest?.body?.name, 'DiceCloud');
    // The player connects their character to the same channel: the same webhook
    const again = await connect(`creature:${creatureId}`, { user: PLAYER });
    await edited(again.token);
    assert.lengthOf(fake.botWebhooks, 1, 'one webhook per channel');
    assert.equal((await creature()).discordChannel.webhookId, channel.webhookId);
    assert.lengthOf(await ConnectedWebhooks.find().fetchAsync(), 1);
  });

  it('/connect in a forum\'s post connects the forum: sessions as posts, with the buttons', async function () {
    const { token } = await connect(`folder:${folderId}`, { channel: { id: POST, type: 11, parent_id: FORUM } });
    assert.include((await edited(token)).content, 'in this forum');
    const channel = (await folder()).discord.channel;
    assert.deepEqual([channel.channelId, channel.kind], [FORUM, 'forum']);
    assert.isTrue(fake.requests.some(request => request.path === `/api/v10/channels/${FORUM}` && request.method === 'GET'), 'the parent asked of Discord');
    const opened = await call(startPartySession, gmId, { folderId });
    assert.equal(opened.kind, 'forum');
    const post = (await folder()).discord.session.threadId;
    await settle();
    const before = fake.requests.length;
    await call(rollInitiative, gmId, { folderId });
    await settle();
    const fight = fake.requests.slice(before).filter(request => request.webhookId === channel.webhookId && request.method === 'POST');
    assert.isAtLeast(fight.length, 1);
    for (const request of fight) assert.equal(request.query.thread_id, post, 'in the session\'s post');
    assert.isTrue(customIds(fight.map(request => request.body)).some(id => id.startsWith(`dc:next:${folderId}:`)), 'with the buttons');
  });

  it('/connect refuses: no linked account, no right to the webhooks, no bot or its right, outside a server, another\'s target', async function () {
    const text = async (where: Where, target = `folder:${folderId}`) => (await connect(target, where)).answer.data.content as string;
    assert.include(await text({ user: STRANGER }), 'not linked');
    assert.include(await text({ user: MEMBER, member: ORDINARY }), 'Only those who may manage this channel\'s webhooks');
    assert.include(await text({ app: String(BigInt(1) << BigInt(10)) }), 'DiceCloud\'s bot may not manage');
    assert.include(await text({ guild: null }), 'in a server\'s channel');
    assert.include(await text({ user: PLAYER }), 'only a party you are the game master of');
    assert.include(await text({ user: MEMBER }, `creature:${creatureId}`), 'only a party you are the game master of');
    assert.include(await text({ channel: { id: '1510000000000000009', type: 2 } }), 'works in a text channel');
    assert.notProperty((await folder()).discord ?? {}, 'channel', 'nothing connected by a refusal');
    setBotToken(undefined);
    assert.include(await text({}), 'no bot');
    setBotToken('fake-bot-token');
    // Administrator counts as every right
    const admin = await connect(`folder:${folderId}`, { member: '8', channel: { id: OTHER_TEXT, type: 0 } });
    assert.deepEqual(admin.answer, { type: 5, data: { flags: 64 } });
    await edited(admin.token);
    // The bot refused by Discord there: the party stays where it was
    const { token } = await connect(`folder:${folderId}`, { channel: { id: DENIED, type: 0 } });
    assert.include((await edited(token)).content, '403 50013');
    assert.equal((await folder()).discord.channel.channelId, OTHER_TEXT);
  });

  it('autocompletes what the user may connect', async function () {
    const choices = async (user: string) => (await fake.interact(endpoint(), {
      type: 4, application_id: APP, locale: 'en-US', guild_id: GUILD, channel_id: TEXT, member: { user: { id: user }, permissions: MANAGE },
      data: { name: 'connect', options: [{ name: 'target', type: 3, value: '', focused: true }] },
    })).answer.data.choices;
    assert.deepEqual(await choices(GM), [{ name: 'Party: The table', value: `folder:${folderId}` }]);
    assert.deepEqual(await choices(PLAYER), [{ name: 'Character: Aria', value: `creature:${creatureId}` }]);
  });

  it('"New session" in a connected text channel: the bot creates the thread, and everything goes there', async function () {
    await edited((await connect(`folder:${folderId}`)).token);
    const opened = await call(startPartySession, gmId, { folderId, newThread: true });
    assert.equal(opened.kind, 'thread');
    const created = fake.requests.find(request => request.path === `/api/v10/channels/${TEXT}/threads`);
    assert.deepEqual([created?.body?.type, created?.body?.auto_archive_duration], [11, 10080]);
    assert.match(created?.body?.name, /^Session of .+ — The table$/);
    const session = (await folder()).discord.session;
    assert.equal(session.kind, 'thread');
    await settle();
    const before = fake.requests.length;
    await insertCreatureLogWork({ log: { creatureId, content: [{ value: '1d20' }, { value: '1d20 [7]' }, { value: '7' }] } });
    await settle();
    const posted = fake.requests.slice(before).filter(request => request.method === 'POST' && request.webhookId === session.webhookId);
    assert.lengthOf(posted, 1);
    assert.equal(posted[0].query.thread_id, session.threadId);
    // A character connected there too
    await edited((await connect(`creature:${creatureId}`, { user: PLAYER })).token);
    const own = await call(startCharacterSession, playerId, { creatureId, newThread: true });
    assert.equal(own.kind, 'thread');
  });

  it('says to add the bot when it cannot create the thread, and never creates one elsewhere', async function () {
    // Connected (D4) on a server the bot is not on
    await CreatureFolders.updateAsync(folderId, {
      $set: { 'discord.channel': { webhookId: '1700000000000000021', guildId: GUILD, channelId: ABSENT, connectedAt: new Date() } },
    });
    await ConnectedWebhooks.rawCollection().insertOne({
      _id: '1700000000000000021', webhookId: '1700000000000000021', token: 'absent-token', channelId: ABSENT, guildId: GUILD, createdAt: new Date(),
    });
    let error: any;
    try {
      await call(startPartySession, gmId, { folderId, newThread: true });
    } catch (e) {
      error = e;
    }
    assert.equal(error?.error, 'discord.botUnavailable');
    assert.include(JSON.stringify(error?.details), '404 10004');
    assert.notProperty((await folder()).discord, 'session');
    // The other ways stay
    const header = await call(startPartySession, gmId, { folderId });
    assert.equal(header.kind, 'channel');
    // A pasted webhook: no thread by the bot, whatever the client asks
    await call(setPartyWebhook, gmId, { folderId, webhook: 'https://discord.com/api/webhooks/1200000000000000031/pasted-token' });
    error = undefined;
    try {
      await call(startPartySession, gmId, { folderId, newThread: true });
    } catch (e) {
      error = e;
    }
    assert.equal(error?.error, 'discord.botUnavailable');
    assert.isTrue(fake.requests.filter(request => /\/threads$/.test(request.path))
      .every(request => request.path === `/api/v10/channels/${ABSENT}/threads`), 'no thread asked anywhere else');
  });
});
