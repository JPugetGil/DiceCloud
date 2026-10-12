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
import { rollInitiative, advanceInitiative } from '/imports/api/creature/creatureFolders/methods/initiativeMethods';
import {
  setPartyWebhook, startPartySession, endPartySession, resumePartySession, partySessionAvailability,
} from '/imports/api/creature/creatureFolders/methods/discordMethods';
import {
  setCharacterWebhook, startCharacterSession, endCharacterSession, resumeCharacterSession,
} from '/imports/api/creature/creatures/methods/discordSessionMethods';
import {
  resumableSessions, withPastSession, SESSION_HISTORY_LENGTH, type PastSession,
} from '/imports/api/creature/log/discord/discordSession';
import { creatureWithoutWebhook } from '/imports/api/creature/creatures/webhookVisibility';
import { fakeDiscord, type FakeDiscord, type FakeRequest } from '/imports/api/creature/log/server/fakeDiscord.testFn';

/*
 * The sessions, one way each (2026-10-12): "New session" opens a forum's
 * post, or in a text channel a thread DiceCloud's bot creates, whatever
 * connected the channel, a pasted webhook included; nothing else when the bot
 * cannot, no header message, no thread's link. Everything then goes into the
 * thread, with the buttons of D7 on a connected webhook, never on a pasted
 * one; a thread that stops taking messages ends the session once. "Resume a
 * session" goes back into one of the last ten of the channel connected now,
 * reopening an archived thread; a deleted one leaves the list. The sessions of
 * the old kinds go on until "End session".
 */

const GUILD = '1500000000000000001';
const PARTY = { id: '1100000000000000011', token: 'party-thread-token' };
const OTHER = { id: '1100000000000000012', token: 'other-channel-token' };
const OWN = { id: '1100000000000000013', token: 'own-thread-token' };
const FORUM = { id: '1100000000000000014', token: 'forum-thread-token' };
const UNSEEN = { id: '1100000000000000015', token: 'unseen-channel-token' };
const CONNECTED = { id: '1700000000000000011', token: 'connected-thread-token' };
const url = (webhook: { id: string, token: string }) => `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`;
// Where the fake's pasted webhooks post: 9 then the webhook's id
const channelOf = (webhook: { id: string }) => `9${webhook.id.slice(1)}`;
const call = (method: any, userId: string, args: any) => method._execute({ userId }, args);
const customIds = (bodies: unknown[]) => [...JSON.stringify(bodies).matchAll(/"custom_id":"([^"]+)"/g)].map(match => match[1]);
const past = (threadId: string, more: Partial<PastSession> = {}): PastSession => ({
  threadId, kind: 'thread', channelId: '1', webhookId: 'w', startedAt: new Date(), ...more,
});

describe('Discord sessions\' history', function () {
  it('keeps the last ten, newest first, once each', function () {
    let history: PastSession[] = [];
    for (let i = 1; i <= SESSION_HISTORY_LENGTH + 2; i += 1) history = withPastSession(history, past(String(i)));
    assert.deepEqual(history.map(one => one.threadId), ['12', '11', '10', '9', '8', '7', '6', '5', '4', '3']);
    // Resumed: first again, not twice
    history = withPastSession(history, history[5]);
    assert.deepEqual(history.map(one => one.threadId), ['7', '12', '11', '10', '9', '8', '6', '5', '4', '3']);
  });

  it('offers those of the channel connected now, but the one open', function () {
    const history = [
      past('1', { channelId: 'A', webhookId: 'w1' }), past('2', { channelId: 'B', webhookId: 'w1' }),
      past('3', { channelId: undefined, webhookId: 'w2' }), past('4', { channelId: 'A', webhookId: 'w3' }),
    ];
    const ids = (here: Parameters<typeof resumableSessions>[1]) => resumableSessions(history, here).map(one => one.threadId);
    assert.deepEqual(ids({ channelId: 'A', webhookId: 'w9' }), ['1', '4'], 'the same channel, whatever its webhook');
    assert.deepEqual(ids({ channelId: 'A', webhookId: 'w2' }), ['1', '3', '4'], 'by its webhook when its channel was unknown');
    assert.deepEqual(ids({ webhookId: 'w1' }), ['1', '2'], 'by the webhook while the channel is not known');
    assert.deepEqual(ids({ channelId: 'A', webhookId: 'w1', openThreadId: '1' }), ['4'], 'not the one open');
    assert.deepEqual(resumableSessions(undefined, { channelId: 'A' }), []);
  });

  it('leaves the last sessions and the closed notice out for those who may not edit the character', function () {
    const creature = {
      _id: 'a', discordSessionClosed: { name: 'x', at: new Date() }, discordSessionHistory: [past('1')], discordWebhookChannelKind: 'text',
    };
    assert.deepEqual(creatureWithoutWebhook(creature as any), { _id: 'a' } as any);
  });
});

if (Meteor.isServer) describe('Sessions in a thread the bot creates, and their resumption', function () {
  this.timeout(30000);
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { setInteractionsPublicKey } = require('/imports/api/discord/server/interactions/interactionSignature');
  const { ConnectedWebhooks } = require('/imports/api/creature/log/server/connectedWebhooks');
  const { setBotToken } = require('/imports/api/discord/server/botClient');
  const { setOAuthConfig } = require('/imports/api/discord/server/oauthClient');
  /* eslint-enable @typescript-eslint/no-require-imports */
  let fake: FakeDiscord;
  let sender: WebhookSender;
  let previous: WebhookSender | undefined;
  let previousKey: unknown;
  let previousBot: unknown;
  let previousConfig: unknown;
  const [gmId, memberId, gmChar, memberChar, folderId] = Array.from({ length: 5 }, () => Random.id());
  const creatureIds = [gmChar, memberChar];

  async function startFake(override?: NonNullable<Parameters<typeof fakeDiscord>[0]>['override']) {
    fake = await fakeDiscord({
      channels: { [FORUM.id]: 'forum' },
      // The channels the bot sees: not UNSEEN's
      botChannels: Object.fromEntries([PARTY, OTHER, OWN, CONNECTED].map(webhook => [channelOf(webhook), { type: 0, guildId: GUILD }])),
      override,
    });
    sender = createWebhookSender({ baseUrl: fake.baseUrl, onGone: forgetWebhook });
    setWebhookSender(sender);
    // The bot's requests go where the application's do
    setOAuthConfig({
      clientId: '1600000000000000001', clientSecret: 'test-secret', apiBase: fake.baseUrl, redirectUri: Meteor.absoluteUrl('discord/oauth/callback'),
    });
  }

  beforeEach(async function () {
    previous = setWebhookSender(undefined);
    previousConfig = setOAuthConfig(null);
    await startFake();
    // The buttons go only where the application takes interactions
    previousKey = setInteractionsPublicKey(fake.publicKey);
    previousBot = setBotToken('fake-bot-token');
    await Meteor.users.rawCollection().insertMany([
      { _id: gmId, createdAt: new Date(), username: `thread-gm-${gmId}`, preferences: { language: 'en' } },
      { _id: memberId, createdAt: new Date(), username: `thread-member-${memberId}`, preferences: { language: 'en' } },
    ] as any[]);
    await Creatures.rawCollection().insertMany([
      { _id: gmChar, name: 'Gandalf', type: 'pc', owner: gmId, readers: [], writers: [], settings: {} },
      { _id: memberChar, name: 'Aria', type: 'pc', owner: memberId, readers: [], writers: [], settings: {} },
    ] as any[]);
    await CreatureFolders.rawCollection().insertOne({
      _id: folderId, name: 'The table', owner: gmId, members: [memberId], creatures: creatureIds, order: 0,
    } as any);
  });

  afterEach(async function () {
    await settle();
    setWebhookSender(previous);
    setInteractionsPublicKey(previousKey as any);
    setBotToken(previousBot as any);
    setOAuthConfig(previousConfig as any);
    await fake.close();
    await Promise.all([
      Meteor.users.removeAsync({ _id: { $in: [gmId, memberId] } }),
      Creatures.removeAsync({ _id: { $in: creatureIds } }),
      CreatureFolders.removeAsync(folderId),
      CreatureLogs.removeAsync({ creatureId: { $in: creatureIds } }),
      ConnectedWebhooks.removeAsync({}),
    ]);
  });

  async function settle() {
    await discordIntakeIdle();
    await initiativeIntakeIdle();
    await sender.idle();
  }
  let seen = 0;
  beforeEach(function () {
    seen = 0;
  });
  /** The messages to a webhook since the last call (not the webhook asked where it posts) */
  async function requests(webhook: { id: string }): Promise<FakeRequest[]> {
    await settle();
    const fresh = fake.requests.slice(seen);
    seen = fake.requests.length;
    return fresh.filter(request => request.method !== 'GET' && request.webhookId === webhook.id);
  }
  /** The threads the bot was asked to create, by channel */
  const threadRequests = () => fake.requests.filter(request => request.method === 'POST' && /\/threads$/.test(request.path));
  const roll = (creatureId: string) => insertCreatureLogWork({
    log: { creatureId, content: [{ value: '1d20 + 5' }, { value: '1d20 [11] + 5' }, { value: '16' }] },
  });
  const folder = async () => await CreatureFolders.findOneAsync(folderId) as any;
  async function failure(method: any, userId: string, args: any): Promise<any> {
    try {
      await call(method, userId, args);
    } catch (e) {
      return e;
    }
    assert.fail(`${method.name} succeeded: ${JSON.stringify(args)}`);
  }
  /** A new session on the party's channel, and the thread it is in */
  async function newPartySession(args: Record<string, unknown> = {}) {
    const opened = await call(startPartySession, gmId, { folderId, ...args });
    return { ...opened, threadId: (await folder()).discord.session.threadId as string };
  }

  it('opens the party\'s session in a thread the bot creates in its pasted webhook\'s channel, posts everything there, never a button', async function () {
    await call(setPartyWebhook, gmId, { folderId, webhook: url(PARTY) });
    await requests(PARTY);
    const opened = await call(startPartySession, gmId, { folderId, timeZone: 'Europe/Paris' });
    assert.equal(opened.kind, 'thread');
    assert.match(opened.name, /^Session of .+ — The table$/);
    const [created] = threadRequests();
    assert.equal(created.path, `/api/v10/channels/${channelOf(PARTY)}/threads`, 'in the channel the webhook posts in');
    assert.deepEqual([created.body.name, created.body.type, created.body.auto_archive_duration], [opened.name, 11, 10080]);
    const [header] = await requests(PARTY);
    const discord = (await folder()).discord;
    const thread = discord.session.threadId;
    assert.deepEqual([header.query.thread_id, header.query.wait], [thread, 'true']);
    assert.match(header.body.content, /^## Session of/);
    assert.notProperty(header.body, 'thread_name', 'never a forum post, never a header in the channel');
    assert.equal(discord.session.kind, 'thread');
    assert.equal(discord.webhookChannelKind, 'text', 'what the channel is, kept');
    assert.deepEqual(discord.sessionHistory.map((one: PastSession) => [one.threadId, one.kind, one.channelId, one.webhookId, one.name]),
      [[thread, 'thread', channelOf(PARTY), PARTY.id, opened.name]]);

    await roll(memberChar);
    await call(rollInitiative, gmId, { folderId });
    await call(advanceInitiative, gmId, { folderId, step: 1 });
    const inside = await requests(PARTY);
    assert.isAtLeast(inside.length, 3, 'the roll, the initiative message, a turn');
    for (const request of inside) assert.equal(request.query.thread_id, thread);
    assert.lengthOf(customIds(inside.map(request => request.body)), 0, 'a pasted webhook takes no button');
  });

  it('puts the buttons on a connected webhook\'s messages in its thread', async function () {
    const channel = channelOf(CONNECTED);
    await ConnectedWebhooks.rawCollection().insertOne({
      _id: CONNECTED.id, webhookId: CONNECTED.id, token: CONNECTED.token, channelId: channel, guildId: GUILD, createdAt: new Date(),
    });
    await CreatureFolders.updateAsync(folderId, {
      $set: { 'discord.channel': { webhookId: CONNECTED.id, guildId: GUILD, channelId: channel, connectedAt: new Date() } },
    });
    const { threadId } = await newPartySession();
    assert.deepEqual(threadRequests().map(request => request.path), [`/api/v10/channels/${channel}/threads`]);
    await requests(CONNECTED);
    await call(rollInitiative, gmId, { folderId });
    const fight = await requests(CONNECTED);
    for (const request of fight) assert.equal(request.query.thread_id, threadId);
    const ids = customIds(fight.map(request => request.body));
    assert.isTrue(ids.some(id => id.startsWith(`dc:next:${folderId}:`)), `buttons ${ids}`);
  });

  it('opens a forum\'s session as a post of its own, without the bot', async function () {
    setBotToken(undefined);
    await call(setPartyWebhook, gmId, { folderId, webhook: url(FORUM) });
    const opened = await call(startPartySession, gmId, { folderId });
    assert.equal(opened.kind, 'forum');
    const [post] = await requests(FORUM);
    assert.equal(post.body.thread_name, opened.name);
    const discord = (await folder()).discord;
    assert.deepEqual([discord.webhookChannelKind, discord.sessionHistory[0].kind, discord.sessionHistory[0].threadId],
      ['forum', 'forum', discord.session.threadId]);
    assert.lengthOf(threadRequests(), 0);
  });

  // As Discord, checked by hand on 2026-10-11: a webhook's message reopens an
  // archived thread and still goes into a locked one
  for (const state of ['archived', 'locked'] as const) {
    it(`keeps a session whose thread is ${state}: Discord still takes the messages there`, async function () {
      await call(setPartyWebhook, gmId, { folderId, webhook: url(PARTY) });
      const { threadId } = await newPartySession();
      await requests(PARTY);
      fake.closeThread(threadId, state);
      await roll(memberChar);
      const posted = await requests(PARTY);
      assert.lengthOf(posted, 1);
      assert.equal(posted[0].query.thread_id, threadId);
      assert.equal(posted[0].status, 204);
      const discord = (await folder()).discord;
      assert.equal(discord.session?.threadId, threadId);
      assert.notProperty(discord, 'sessionClosed');
    });
  }

  it('ends a session whose thread is deleted, once: the messages go back to the channel, a notice says so', async function () {
    await call(setPartyWebhook, gmId, { folderId, webhook: url(PARTY) });
    const opened = await newPartySession();
    await requests(PARTY);
    fake.closeThread(opened.threadId, 'deleted');
    await roll(memberChar);
    const [tried, inChannel] = await requests(PARTY);
    assert.equal(tried.query.thread_id, opened.threadId, 'tried in the thread first');
    assert.isAtLeast(tried.status as number, 400);
    assert.notProperty(inChannel.query, 'thread_id');
    assert.equal(inChannel.status, 204, 'the channel took it');
    const discord = (await folder()).discord;
    assert.notProperty(discord, 'session');
    assert.equal(discord.sessionClosed.name, opened.name);
    // No error loop: the next one goes straight to the channel
    await roll(memberChar);
    const next = await requests(PARTY);
    assert.lengthOf(next, 1);
    assert.notProperty(next[0].query, 'thread_id');
    // A new session takes the notice away
    await call(startPartySession, gmId, { folderId });
    assert.notProperty((await folder()).discord, 'sessionClosed');
  });

  it('ends it too on a code nobody knows yet, as long as the channel takes the message', async function () {
    await call(setPartyWebhook, gmId, { folderId, webhook: url(PARTY) });
    const { threadId } = await newPartySession();
    await settle();
    await fake.close();
    await startFake(request => request.query.thread_id === threadId
      ? { status: 400, headers: { 'Content-Type': 'application/json' }, body: { code: 99999, message: 'Something new' } }
      : undefined);
    await roll(memberChar);
    await settle();
    const posts = fake.requests.filter(request => request.method === 'POST');
    assert.deepEqual(posts.map(request => request.query.thread_id ?? null), [threadId, null]);
    assert.notProperty((await folder()).discord, 'session');
    assert.exists((await folder()).discord.sessionClosed);
  });

  it('keeps the session when the message itself is refused, not the thread', async function () {
    await call(setPartyWebhook, gmId, { folderId, webhook: url(PARTY) });
    const { threadId } = await newPartySession();
    await settle();
    await fake.close();
    // Every message refused, in the thread and in the channel alike
    await startFake(request => request.method === 'POST' && request.webhookId === PARTY.id
      ? { status: 400, headers: { 'Content-Type': 'application/json' }, body: { code: 50035, message: 'Invalid Form Body' } }
      : undefined);
    await roll(memberChar);
    await settle();
    assert.equal((await folder()).discord.session.threadId, threadId);
    assert.notProperty((await folder()).discord, 'sessionClosed');
    await call(endPartySession, gmId, { folderId });
  });

  it('opens a character\'s own session in a thread, and "End session" goes back to the channel', async function () {
    await call(setCharacterWebhook, memberId, { creatureId: memberChar, webhook: url(OWN) });
    await settle();
    const opened = await call(startCharacterSession, memberId, { creatureId: memberChar });
    assert.equal(opened.kind, 'thread');
    assert.match(opened.name, /— Aria$/);
    const creature = await Creatures.findOneAsync(memberChar) as any;
    const thread = creature.discordSession.threadId;
    assert.deepEqual([creature.discordWebhookChannelKind, creature.discordSessionHistory[0].threadId], ['text', thread]);
    await requests(OWN);
    await roll(memberChar);
    const [inside] = await requests(OWN);
    assert.equal(inside.query.thread_id, thread);
    await call(endCharacterSession, memberId, { creatureId: memberChar });
    await roll(memberChar);
    const [after] = await requests(OWN);
    assert.notProperty(after.query, 'thread_id');
  });

  it('refuses the ways there are no more: a thread\'s link; and opens nothing in a text channel the bot cannot reach', async function () {
    await call(setPartyWebhook, gmId, { folderId, webhook: url(PARTY) });
    await call(setCharacterWebhook, memberId, { creatureId: memberChar, webhook: url(OWN) });
    await requests(PARTY);
    const link = `https://discord.com/channels/${GUILD}/${fake.createThread(channelOf(PARTY))}`;
    assert.equal((await failure(startPartySession, gmId, { folderId, threadLink: link })).error, 'discord.modeRemoved');
    assert.equal((await failure(startCharacterSession, memberId, { creatureId: memberChar, threadLink: link })).error, 'discord.modeRemoved');
    assert.lengthOf(await requests(PARTY), 0, 'nothing posted');

    // No bot on this server: a forum's post is tried, the text channel
    // refuses it, and nothing else opens, no header message
    setBotToken(undefined);
    assert.deepEqual(await call(partySessionAvailability, gmId, { folderId }), { newSession: 'ready' }, 'not known yet');
    assert.equal((await failure(startPartySession, gmId, { folderId })).error, 'discord.noBot');
    const tried = await requests(PARTY);
    assert.deepEqual(tried.map(request => [!!request.body.thread_name, request.status]), [[true, 400]]);
    assert.notProperty((await folder()).discord, 'session');
    assert.equal((await folder()).discord.webhookChannelKind, 'text');
    assert.deepEqual(await call(partySessionAvailability, gmId, { folderId }), { newSession: 'noBot' }, 'unavailable, now that it is known');
    // The next try goes straight to the bot's way: no forum post tried again
    assert.equal((await failure(startPartySession, gmId, { folderId })).error, 'discord.noBot');
    assert.lengthOf(await requests(PARTY), 0);

    // With the bot, but not on that server (it does not see the channel): the
    // thread refused, said with Discord's answer, still nothing else
    setBotToken('fake-bot-token');
    await call(setPartyWebhook, gmId, { folderId, webhook: url(UNSEEN) });
    await requests(UNSEEN);
    const refused = await failure(startPartySession, gmId, { folderId });
    assert.equal(refused.error, 'discord.botUnavailable');
    assert.include(JSON.stringify(refused.details), '404 10003');
    assert.deepEqual(threadRequests().map(request => request.path), [`/api/v10/channels/${channelOf(UNSEEN)}/threads`],
      'only ever in the webhook\'s own channel');
    assert.deepEqual((await requests(UNSEEN)).map(request => !!request.body.thread_name), [true], 'a forum\'s post tried, no header');
    assert.notProperty((await folder()).discord, 'session');
    assert.deepEqual(await call(partySessionAvailability, gmId, { folderId }), { newSession: 'noBot' });
  });

  it('says whether "New session" can work: the bot asked whether it sees the channel', async function () {
    await call(setPartyWebhook, gmId, { folderId, webhook: url(PARTY) });
    assert.deepEqual(await call(partySessionAvailability, gmId, { folderId }), { newSession: 'ready' });
    assert.equal((await folder()).discord.webhookChannelKind, 'text', 'learned from the bot');
    await call(setPartyWebhook, gmId, { folderId, webhook: url(FORUM) });
    assert.deepEqual(await call(partySessionAvailability, gmId, { folderId }), { newSession: 'ready' });
    // A connected text channel the bot is not in
    const channel = channelOf(UNSEEN);
    await ConnectedWebhooks.rawCollection().insertOne({
      _id: CONNECTED.id, webhookId: CONNECTED.id, token: CONNECTED.token, channelId: channel, guildId: GUILD, createdAt: new Date(),
    });
    await CreatureFolders.updateAsync(folderId, {
      $set: { 'discord.channel': { webhookId: CONNECTED.id, guildId: GUILD, channelId: channel, connectedAt: new Date() } },
    });
    assert.deepEqual(await call(partySessionAvailability, gmId, { folderId }), { newSession: 'noBot' });
    // Its forum, connected with /connect: no bot needed
    await CreatureFolders.updateAsync(folderId, { $set: { 'discord.channel.kind': 'forum' } });
    assert.deepEqual(await call(partySessionAvailability, gmId, { folderId }), { newSession: 'ready' });
    // Only the game master asks
    assert.equal((await failure(partySessionAvailability, memberId, { folderId })).error, 'discord.denied');
  });

  it('lets the sessions of the old kinds go on until "End session": a header message, a thread whose link was pasted', async function () {
    await call(setPartyWebhook, gmId, { folderId, webhook: url(PARTY) });
    await CreatureFolders.updateAsync(folderId, {
      $set: { 'discord.session': { webhookId: PARTY.id, kind: 'channel', messageId: '1300000000000000999', name: 'Old', startedAt: new Date() } },
    });
    await requests(PARTY);
    await roll(memberChar);
    const [inChannel] = await requests(PARTY);
    assert.notProperty(inChannel.query, 'thread_id');
    assert.equal((await folder()).discord.session.kind, 'channel', 'still open');
    await call(endPartySession, gmId, { folderId });
    assert.notProperty((await folder()).discord, 'session');

    const thread = fake.createThread(channelOf(PARTY));
    await CreatureFolders.updateAsync(folderId, {
      $set: { 'discord.session': { webhookId: PARTY.id, kind: 'thread', threadId: thread, name: 'Pasted', startedAt: new Date() } },
    });
    await roll(memberChar);
    const [inThread] = await requests(PARTY);
    assert.equal(inThread.query.thread_id, thread);
    assert.notProperty((await folder()).discord, 'sessionHistory', 'not one DiceCloud opened: nothing to resume');
    await call(endPartySession, gmId, { folderId });
    assert.notProperty((await folder()).discord, 'session');
  });

  it('resumes a session whose thread was archived: "The session goes on" reopens it, and everything goes there again', async function () {
    await call(setPartyWebhook, gmId, { folderId, webhook: url(PARTY) });
    const first = await newPartySession();
    const second = await newPartySession();
    assert.deepEqual((await folder()).discord.sessionHistory.map((one: PastSession) => one.threadId), [second.threadId, first.threadId]);
    await call(endPartySession, gmId, { folderId });
    fake.closeThread(first.threadId, 'archived');
    await requests(PARTY);
    const resumed = await call(resumePartySession, gmId, { folderId, threadId: first.threadId, timeZone: 'Europe/Paris' });
    assert.deepEqual(resumed, { kind: 'thread', name: first.name, resumed: true });
    const [goesOn] = await requests(PARTY);
    assert.deepEqual([goesOn.query.thread_id, goesOn.query.wait, goesOn.status], [first.threadId, 'true', 200]);
    assert.match(goesOn.body.content, /^\*\*The session goes on — \w+ \d+, \d{4}\*\*$/);
    assert.lengthOf(threadRequests(), 2, 'no new thread');
    const discord = (await folder()).discord;
    assert.deepEqual([discord.session.kind, discord.session.threadId, discord.session.name], ['thread', first.threadId, first.name]);
    assert.deepEqual(discord.sessionHistory.map((one: PastSession) => one.threadId), [first.threadId, second.threadId], 'first again');
    await roll(memberChar);
    const [inside] = await requests(PARTY);
    assert.equal(inside.query.thread_id, first.threadId);
  });

  it('takes a deleted thread off the list, and says so', async function () {
    await call(setPartyWebhook, gmId, { folderId, webhook: url(PARTY) });
    const opened = await newPartySession();
    await call(endPartySession, gmId, { folderId });
    fake.closeThread(opened.threadId, 'deleted');
    const error = await failure(resumePartySession, gmId, { folderId, threadId: opened.threadId });
    assert.equal(error.error, 'discord.threadGone');
    assert.include(error.message, opened.name);
    const discord = (await folder()).discord;
    assert.deepEqual(discord.sessionHistory, []);
    assert.notProperty(discord, 'session');
  });

  it('resumes a forum\'s post, and only a session of the channel connected now', async function () {
    setBotToken(undefined);
    await call(setPartyWebhook, gmId, { folderId, webhook: url(FORUM) });
    const post = await newPartySession();
    await call(setPartyWebhook, gmId, { folderId, webhook: url(PARTY) });
    // Another channel's: not offered, refused
    assert.equal((await failure(resumePartySession, gmId, { folderId, threadId: post.threadId })).error, 'discord.resumeUnknown');
    assert.equal((await failure(resumePartySession, gmId, { folderId, threadId: '1300000000000000777' })).error, 'discord.resumeUnknown');
    assert.lengthOf((await folder()).discord.sessionHistory, 1, 'kept for that channel');
    // Back to the forum: its post goes on
    await call(setPartyWebhook, gmId, { folderId, webhook: url(FORUM) });
    await requests(FORUM);
    assert.deepEqual(await call(resumePartySession, gmId, { folderId, threadId: post.threadId }), { kind: 'forum', name: post.name, resumed: true });
    const [goesOn] = await requests(FORUM);
    assert.equal(goesOn.query.thread_id, post.threadId);
    assert.notProperty(goesOn.body, 'thread_name');
    // A forum's deleted post leaves the list too
    await call(endPartySession, gmId, { folderId });
    fake.deleteThread(post.threadId);
    assert.equal((await failure(resumePartySession, gmId, { folderId, threadId: post.threadId })).error, 'discord.threadGone');
    assert.deepEqual((await folder()).discord.sessionHistory, []);
  });

  it('resumes a character\'s own session, for its editors alone', async function () {
    await call(setCharacterWebhook, memberId, { creatureId: memberChar, webhook: url(OWN) });
    const opened = await call(startCharacterSession, memberId, { creatureId: memberChar });
    const threadId = (await Creatures.findOneAsync(memberChar) as any).discordSession.threadId;
    await call(endCharacterSession, memberId, { creatureId: memberChar });
    // Not by someone who may not edit it
    await failure(resumeCharacterSession, gmId, { creatureId: memberChar, threadId });
    assert.notProperty(await Creatures.findOneAsync(memberChar), 'discordSession');
    assert.deepEqual(await call(resumeCharacterSession, memberId, { creatureId: memberChar, threadId }), { kind: 'thread', name: opened.name, resumed: true });
    assert.equal((await Creatures.findOneAsync(memberChar) as any).discordSession.threadId, threadId);
  });
});
