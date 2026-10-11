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
  setPartyWebhook, startPartySession, endPartySession,
} from '/imports/api/creature/creatureFolders/methods/discordMethods';
import {
  setCharacterWebhook, startCharacterSession, endCharacterSession,
} from '/imports/api/creature/creatures/methods/discordSessionMethods';
import { parseThreadLink } from '/imports/api/creature/log/discord/discordChannel';
import { creatureWithoutWebhook } from '/imports/api/creature/creatures/webhookVisibility';
import { fakeDiscord, type FakeDiscord, type FakeRequest } from '/imports/api/creature/log/server/fakeDiscord.testFn';

/*
 * Sessions in a thread of a text channel: the game master makes the thread in
 * Discord and pastes its link. On the webhook's server only, kept only if
 * Discord takes the header there; then everything goes into it, with the
 * buttons of D7 on a connected webhook, never on a pasted one; a thread that
 * stops taking messages ends the session once, the messages back to the
 * channel and a notice left, without an error at every message.
 */

const GUILD = '1500000000000000001';
const PARTY = { id: '1100000000000000011', token: 'party-thread-token' };
const OWN = { id: '1100000000000000013', token: 'own-thread-token' };
const CONNECTED = { id: '1700000000000000011', token: 'connected-thread-token' };
const url = (webhook: { id: string, token: string }) => `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`;
const link = (threadId: string, guildId = GUILD) => `https://discord.com/channels/${guildId}/${threadId}`;
const call = (method: any, userId: string, args: any) => method._execute({ userId }, args);
const customIds = (bodies: unknown[]) => [...JSON.stringify(bodies).matchAll(/"custom_id":"([^"]+)"/g)].map(match => match[1]);

describe('Discord threads\' links', function () {
  it('reads the server and the thread of a link from Discord\'s app, and nothing else', function () {
    const thread = { guildId: GUILD, threadId: '1600000000000000099' };
    assert.deepEqual(parseThreadLink(link('1600000000000000099')), thread);
    assert.deepEqual(parseThreadLink(`https://ptb.discord.com/channels/${GUILD}/1600000000000000099/1600000000000000100`), thread, 'a message\'s link');
    assert.deepEqual(parseThreadLink(` https://canary.discordapp.com/channels/${GUILD}/1600000000000000099/ `), thread);
    for (const wrong of ['', 'https://discord.com/channels/@me/1600000000000000099', 'http://discord.com/channels/1/2',
      'https://evil.example/channels/1/2', 'https://discord.com/channels/1', 'not a link', 'https://discord.com/channels/1/2?x=1']) {
      assert.isUndefined(parseThreadLink(wrong), wrong);
    }
  });

  it('leaves the notice of a closed thread out for those who may not edit the character', function () {
    assert.notProperty(creatureWithoutWebhook({ _id: 'a', discordSessionClosed: { name: 'x', at: new Date() } } as any), 'discordSessionClosed');
  });
});

if (Meteor.isServer) describe('Sessions in a thread of a text channel', function () {
  this.timeout(30000);
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { setInteractionsPublicKey } = require('/imports/api/discord/server/interactions/interactionSignature');
  const { ConnectedWebhooks } = require('/imports/api/creature/log/server/connectedWebhooks');
  /* eslint-enable @typescript-eslint/no-require-imports */
  let fake: FakeDiscord;
  let sender: WebhookSender;
  let previous: WebhookSender | undefined;
  let previousKey: unknown;
  const [gmId, memberId, gmChar, memberChar, folderId] = Array.from({ length: 5 }, () => Random.id());
  const creatureIds = [gmChar, memberChar];

  beforeEach(async function () {
    fake = await fakeDiscord();
    sender = createWebhookSender({ baseUrl: fake.baseUrl, onGone: forgetWebhook });
    previous = setWebhookSender(sender);
    // The buttons go only where the application takes interactions
    previousKey = setInteractionsPublicKey(fake.publicKey);
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
  const roll = (creatureId: string) => insertCreatureLogWork({
    log: { creatureId, content: [{ value: '1d20 + 5' }, { value: '1d20 [11] + 5' }, { value: '16' }] },
  });
  const folder = async () => await CreatureFolders.findOneAsync(folderId) as any;
  async function refused(args: any, code: string) {
    let error: any;
    try {
      await call(startPartySession, gmId, { folderId, ...args });
    } catch (e) {
      error = e;
    }
    assert.equal(error?.error, code, JSON.stringify(args));
  }

  it('opens the party\'s session in a thread of its pasted webhook\'s channel, posts everything there, never a button', async function () {
    await call(setPartyWebhook, gmId, { folderId, webhook: url(PARTY) });
    const channel = fake.channelOf(PARTY.id);
    const thread = fake.createThread(channel);
    await refused({ threadLink: 'https://example.com/channels/1/2' }, 'discord.threadLink');
    await refused({ threadLink: link(thread, '1500000000000000777') }, 'discord.threadOtherServer');
    await refused({ threadLink: link(fake.createThread('1500000000000000555')) }, 'discord.threadRefused');
    await refused({ threadLink: link('1500000000000000444') }, 'discord.threadRefused');
    const archived = fake.createThread(channel);
    fake.closeThread(archived, 'archived');
    await refused({ threadLink: link(archived) }, 'discord.threadRefused');
    assert.notProperty((await folder()).discord, 'session', 'no session from a refused thread');

    await requests(PARTY);
    const opened = await call(startPartySession, gmId, { folderId, timeZone: 'Europe/Paris', threadLink: link(thread) });
    assert.equal(opened.kind, 'thread');
    const [header] = await requests(PARTY);
    assert.deepEqual([header.query.thread_id, header.query.wait], [thread, 'true']);
    assert.match(header.body.content, /^## Session of/);
    assert.notProperty(header.body, 'thread_name');
    const session = (await folder()).discord.session;
    assert.deepEqual([session.kind, session.threadId], ['thread', thread]);

    await roll(memberChar);
    await call(rollInitiative, gmId, { folderId });
    await call(advanceInitiative, gmId, { folderId, step: 1 });
    const inside = await requests(PARTY);
    assert.isAtLeast(inside.length, 3, 'the roll, the initiative message, a turn');
    for (const request of inside) assert.equal(request.query.thread_id, thread);
    assert.lengthOf(customIds(inside.map(request => request.body)), 0, 'a pasted webhook takes no button');
  });

  it('puts the buttons on a connected webhook\'s messages in its thread', async function () {
    const channel = fake.channelOf(CONNECTED.id);
    await ConnectedWebhooks.rawCollection().insertOne({
      _id: CONNECTED.id, webhookId: CONNECTED.id, token: CONNECTED.token, channelId: channel, guildId: GUILD, createdAt: new Date(),
    });
    await CreatureFolders.updateAsync(folderId, {
      $set: { 'discord.channel': { webhookId: CONNECTED.id, guildId: GUILD, channelId: channel, connectedAt: new Date() } },
    });
    const thread = fake.createThread(channel);
    await refused({ threadLink: link(thread, '1500000000000000777') }, 'discord.threadOtherServer');
    await call(startPartySession, gmId, { folderId, threadLink: link(thread) });
    await requests(CONNECTED);
    await call(rollInitiative, gmId, { folderId });
    const fight = await requests(CONNECTED);
    for (const request of fight) assert.equal(request.query.thread_id, thread);
    const ids = customIds(fight.map(request => request.body));
    assert.isTrue(ids.some(id => id.startsWith(`dc:next:${folderId}:`)), `buttons ${ids}`);
  });

  for (const state of ['archived', 'locked', 'deleted'] as const) {
    it(`ends a session whose thread is ${state}, once: the messages go back to the channel, a notice says so`, async function () {
      await call(setPartyWebhook, gmId, { folderId, webhook: url(PARTY) });
      const thread = fake.createThread(fake.channelOf(PARTY.id));
      const opened = await call(startPartySession, gmId, { folderId, threadLink: link(thread) });
      await requests(PARTY);
      fake.closeThread(thread, state);
      await roll(memberChar);
      const [tried, inChannel] = await requests(PARTY);
      assert.equal(tried.query.thread_id, thread, 'tried in the thread first');
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
      // A new session takes the notice away; ending it too
      await call(startPartySession, gmId, { folderId });
      assert.notProperty((await folder()).discord, 'sessionClosed');
    });
  }

  it('ends it too on a code nobody knows yet, as long as the channel takes the message', async function () {
    await call(setPartyWebhook, gmId, { folderId, webhook: url(PARTY) });
    const thread = fake.createThread(fake.channelOf(PARTY.id));
    await call(startPartySession, gmId, { folderId, threadLink: link(thread) });
    await fake.close();
    fake = await fakeDiscord({
      override: request => request.query.thread_id === thread
        ? { status: 400, headers: { 'Content-Type': 'application/json' }, body: { code: 99999, message: 'Something new' } }
        : undefined,
    });
    sender = createWebhookSender({ baseUrl: fake.baseUrl, onGone: forgetWebhook });
    setWebhookSender(sender);
    await roll(memberChar);
    await settle();
    const posts = fake.requests.filter(request => request.method === 'POST');
    assert.deepEqual(posts.map(request => request.query.thread_id ?? null), [thread, null]);
    assert.notProperty((await folder()).discord, 'session');
    assert.exists((await folder()).discord.sessionClosed);
  });

  it('keeps the session when the message itself is refused, not the thread', async function () {
    await call(setPartyWebhook, gmId, { folderId, webhook: url(PARTY) });
    const thread = fake.createThread(fake.channelOf(PARTY.id));
    await call(startPartySession, gmId, { folderId, threadLink: link(thread) });
    await fake.close();
    // Every message refused, in the thread and in the channel alike
    fake = await fakeDiscord({
      override: request => request.method === 'POST' && request.webhookId === PARTY.id
        ? { status: 400, headers: { 'Content-Type': 'application/json' }, body: { code: 50035, message: 'Invalid Form Body' } }
        : undefined,
    });
    sender = createWebhookSender({ baseUrl: fake.baseUrl, onGone: forgetWebhook });
    setWebhookSender(sender);
    await roll(memberChar);
    await settle();
    assert.equal((await folder()).discord.session.threadId, thread);
    assert.notProperty((await folder()).discord, 'sessionClosed');
    await call(endPartySession, gmId, { folderId });
  });

  it('opens a character\'s own session in a thread, and "End session" goes back to the channel', async function () {
    await call(setCharacterWebhook, memberId, { creatureId: memberChar, webhook: url(OWN) });
    await settle();
    const thread = fake.createThread(fake.channelOf(OWN.id));
    let error: any;
    try {
      await call(startCharacterSession, memberId, { creatureId: memberChar, threadLink: 'not a link' });
    } catch (e) {
      error = e;
    }
    assert.equal(error?.error, 'discord.threadLink');
    const opened = await call(startCharacterSession, memberId, { creatureId: memberChar, threadLink: link(thread) });
    assert.equal(opened.kind, 'thread');
    await requests(OWN);
    await roll(memberChar);
    const [inside] = await requests(OWN);
    assert.equal(inside.query.thread_id, thread);
    await call(endCharacterSession, memberId, { creatureId: memberChar });
    await roll(memberChar);
    const [after] = await requests(OWN);
    assert.notProperty(after.query, 'thread_id');
  });
});
