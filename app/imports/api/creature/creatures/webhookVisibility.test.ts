import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { DDP } from 'meteor/ddp';
import { Mongo } from 'meteor/mongo';
import { Accounts } from 'meteor/accounts-base';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import VERSION from '/imports/constants/VERSION';
import {
  creatureForClient, creatureWithoutDiscord, creatureWithoutWebhook, creatureWithoutWebhookUrl, settingsFieldsWithoutWebhook,
} from '/imports/api/creature/creatures/webhookVisibility';

if (Meteor.isServer) {
  // Unit tests load no entry point: the publications and the REST API under
  // test register here, on the server only
  /* eslint-disable @typescript-eslint/no-require-imports */
  require('/imports/api/creature/creatures/server/publications/singleCharacter');
  require('/imports/api/creature/creatures/server/publications/characterList');
  require('/imports/api/creature/creatureFolders/server/publications/partyBoard');
  require('/imports/api/users/server/publications/ownedDocuments');
  require('/imports/api/rest/server/index');
  /* eslint-enable @typescript-eslint/no-require-imports */
}

const TOKEN = 'secret-token';
const WEBHOOK = `https://discord.com/api/webhooks/123456/${TOKEN}`;
const OTHER_SETTINGS = { hitDiceResetMultiplier: 0.5, hideSpellsTab: true };
// A session's ids are the editors' too
const SESSION = { webhookId: '123456', kind: 'forum', threadId: '777000111', messageId: '777000111', startedAt: new Date() };
// A channel connected instead (D4): its webhook's id, and where it posts
const CHANNEL = { webhookId: '999000111', guildId: '999000222', channelId: '999000333', connectedAt: new Date() };
// The party's own, the game master's alone (its id); the players get the summary
const PARTY_TOKEN = 'party-secret';
const PARTY_WEBHOOK = `https://discord.com/api/webhooks/654321/${PARTY_TOKEN}`;
const PARTY_SESSION = { ...SESSION, webhookId: '654321', threadId: '888000222', messageId: '888000222' };
// The last sessions, to resume one: their threads' ids and names, the editors' and the game master's alone
const PAST = { threadId: '777000444', kind: 'thread', name: 'Session of October 1, 2026 — Aria', channelId: '999000333', webhookId: '123456', startedAt: new Date() };
const PARTY_PAST = { ...PAST, threadId: '888000444', name: 'Session of October 1, 2026 — The table', webhookId: '654321' };

describe('Who gets a character\'s Discord webhook (webhookVisibility)', function () {
  it('lists every setting but the webhook', function () {
    const fields = settingsFieldsWithoutWebhook();
    assert.notProperty(fields, 'settings.discordWebhook');
    assert.include(Object.keys(fields), 'settings.hitDiceResetMultiplier');
    assert.include(Object.keys(fields), 'settings.hideUnusedStats');
    assert.lengthOf(Object.keys(fields), 9);
  });

  it('copies a character without its webhook\'s URL for its editors, without anything of it for the others', function () {
    const creature = {
      _id: 'a', settings: { discordWebhook: WEBHOOK, ...OTHER_SETTINGS }, discordSession: SESSION, discordChannel: CHANNEL,
      discordWebhookId: '123456', discordWebhookChannelKind: 'text', discordSessionHistory: [PAST],
    };
    const forEditors = {
      _id: 'a', settings: OTHER_SETTINGS, discordSession: SESSION, discordChannel: CHANNEL, discordWebhookId: '123456',
      discordWebhookChannelKind: 'text', discordSessionHistory: [PAST],
    };
    assert.deepEqual<object>(creatureWithoutWebhookUrl(creature), forEditors);
    assert.deepEqual<object>(creatureForClient(creature, true), forEditors);
    assert.deepEqual<object>(creatureWithoutWebhook(creature), { _id: 'a', settings: OTHER_SETTINGS });
    assert.deepEqual<object>(creatureForClient(creature, false), { _id: 'a', settings: OTHER_SETTINGS });
    assert.deepEqual<object>(creatureWithoutDiscord(creature), { _id: 'a', settings: OTHER_SETTINGS }, 'nothing of it in a file');
    assert.equal(creature.settings.discordWebhook, WEBHOOK, 'the original is untouched');
    assert.deepEqual<object>(creatureWithoutWebhook({ _id: 'c', settings: {}, discordSession: SESSION }), { _id: 'c', settings: {} });
    const without = { _id: 'b', settings: {} };
    assert.strictEqual(creatureWithoutWebhook(without), without);
    assert.strictEqual(creatureWithoutWebhookUrl(without), without);
  });
});

if (Meteor.isServer) describe('Publications and the REST API: the webhook\'s id to editors, its URL to nobody', function () {
  this.timeout(30000);
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { setTokenKeys, sealSecret } = require('/imports/api/discord/server/secretCipher');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const [ownerId, writerId, readerId, gmId, strangerId, memberId] = [
    Random.id(), Random.id(), Random.id(), Random.id(), Random.id(), Random.id(),
  ];
  const userIds = [ownerId, writerId, readerId, gmId, strangerId, memberId];
  const [creatureId, folderId] = [Random.id(), Random.id()];
  let connections: any[] = [];
  // Every DDP message any client of these tests received
  const frames: string[] = [];
  let restoreKeys: () => void;
  let sealed: string[];

  before(async function () {
    restoreKeys = setTokenKeys(Buffer.alloc(32, 7).toString('base64'));
    sealed = [sealSecret(WEBHOOK), sealSecret(PARTY_WEBHOOK)];
    assert.match(sealed[0], /^enc1\./);
    await Meteor.users.rawCollection().insertMany(userIds.map((_id, i) => ({
      _id, createdAt: new Date(), username: `webhook-test-${i}-${_id}`,
    })) as any[]);
    await Creatures.rawCollection().insertOne({
      _id: creatureId, name: 'Aria', type: 'pc', owner: ownerId, writers: [writerId], readers: [readerId, gmId],
      public: true, computeVersion: VERSION, settings: { discordWebhook: sealed[0], ...OTHER_SETTINGS },
      discordWebhookId: '123456',
      discordSession: SESSION,
      discordChannel: CHANNEL,
      discordSessionHistory: [PAST],
    } as any);
    await CreatureFolders.rawCollection().insertOne({
      _id: folderId, name: 'The table', owner: gmId, creatures: [creatureId], members: [memberId], order: 0,
      discord: {
        webhook: sealed[1], webhookId: '654321', session: PARTY_SESSION, initiative: { webhookId: '654321', messageId: '888000333' },
        sessionHistory: [PARTY_PAST],
      },
      discordPosting: { rolls: true, combat: true },
    } as any);
  });

  afterEach(function () {
    connections.forEach(connection => connection.disconnect());
    connections = [];
  });

  after(async function () {
    restoreKeys();
    await CreatureFolders.removeAsync(folderId);
    await Creatures.removeAsync(creatureId);
    await Meteor.users.removeAsync({ _id: { $in: userIds } });
  });

  async function loginToken(userId: string) {
    const accounts = Accounts as any;
    const stamped = accounts._generateStampedLoginToken();
    await accounts._insertLoginToken(userId, stamped);
    return stamped.token as string;
  }

  /** A DDP client of this server, signed in as the user if one is given; its messages recorded */
  async function clientOf(userId?: string) {
    const connection = DDP.connect(Meteor.absoluteUrl());
    connections.push(connection);
    (connection as any)._stream.on('message', (message: string) => frames.push(message));
    if (userId) await connection.callAsync('login', { resume: await loginToken(userId) });
    const creatures = new Mongo.Collection<any>('creatures', { connection });
    const folders = new Mongo.Collection<any>('creatureFolders', { connection });
    const subscribe = (name: string, ...args: any[]) => new Promise((resolve, reject) => connection.subscribe(name, ...args, {
      onReady: resolve,
      onStop: (error: unknown) => error && reject(error),
    }));
    const creature = () => creatures.findOneAsync(creatureId);
    const settings = async () => (await creature())?.settings;
    const folder = () => folders.findOneAsync(folderId);
    return { subscribe, settings, creature, folder };
  }

  async function eventually(condition: () => Promise<boolean>) {
    for (let i = 0; i < 50 && !await condition(); i += 1) await new Promise(resolve => setTimeout(resolve, 100));
  }

  it('sends its editors the webhook\'s id, its channel and its session, never its URL', async function () {
    for (const userId of [ownerId, writerId]) {
      const client = await clientOf(userId);
      await client.subscribe('singleCharacter', creatureId);
      assert.deepEqual(await client.settings(), OTHER_SETTINGS);
      assert.equal((await client.creature())?.discordWebhookId, '123456');
      assert.equal((await client.creature())?.discordSession?.threadId, SESSION.threadId);
      assert.equal((await client.creature())?.discordChannel?.channelId, CHANNEL.channelId);
      assert.equal((await client.creature())?.discordSessionHistory?.[0]?.threadId, PAST.threadId);
    }
    // The owner's own documents too, merged with the sheet's
    const owner = await clientOf(ownerId);
    await owner.subscribe('ownedDocuments');
    assert.deepEqual(await owner.settings(), OTHER_SETTINGS);
    assert.equal((await owner.creature())?.discordWebhookId, '123456');
    await owner.subscribe('singleCharacter', creatureId);
    assert.deepEqual(await owner.settings(), OTHER_SETTINGS);
  });

  it('sends the other settings, nothing of the webhook, to a reader and to anyone reading a public character', async function () {
    for (const userId of [readerId, strangerId, undefined]) {
      const client = await clientOf(userId);
      await client.subscribe('singleCharacter', creatureId);
      assert.deepEqual(await client.settings(), OTHER_SETTINGS, `user ${userId}`);
      for (const field of ['discordSession', 'discordChannel', 'discordWebhookId', 'discordSessionHistory']) {
        assert.notProperty(await client.creature(), field, `user ${userId}`);
      }
    }
  });

  it('sends the party\'s webhook id and session to its game master alone, never its URL; the players learn what it posts', async function () {
    const gm = await clientOf(gmId);
    await gm.subscribe('partyBoard', folderId);
    const discord = (await gm.folder())?.discord;
    assert.equal(discord?.webhookId, '654321');
    assert.equal(discord?.session?.threadId, PARTY_SESSION.threadId);
    assert.equal(discord?.sessionHistory?.[0]?.threadId, PARTY_PAST.threadId);
    assert.notProperty(discord, 'webhook');
    const member = await clientOf(memberId);
    await member.subscribe('partyBoard', folderId);
    await member.subscribe('characterList');
    const seen = await member.folder();
    assert.equal(seen?.name, 'The table', 'the member reads the board');
    assert.notProperty(seen, 'discord');
    assert.deepEqual(seen?.discordPosting, { rolls: true, combat: true });
    // Nor the character's session, which the board leaves out for the game master too
    assert.notProperty(await gm.creature(), 'discordSession');
    assert.notProperty(await gm.creature(), 'discordSessionHistory');
  });

  it('never sends it to a game master who only reads the character, from the board or the sheet', async function () {
    const client = await clientOf(gmId);
    await client.subscribe('partyBoard', folderId);
    assert.deepEqual(await client.settings(), OTHER_SETTINGS);
    // A rest from the board opens the sheet's subscription too: merged, still nothing
    await client.subscribe('singleCharacter', creatureId);
    assert.deepEqual(await client.settings(), OTHER_SETTINGS);
    await client.subscribe('characterList');
    assert.deepEqual(await client.settings(), OTHER_SETTINGS);
    assert.notProperty(await client.creature(), 'discordWebhookId');
  });

  it('takes the webhook\'s id back from a writer who becomes a reader', async function () {
    const client = await clientOf(writerId);
    await client.subscribe('singleCharacter', creatureId);
    assert.equal((await client.creature())?.discordWebhookId, '123456');
    await Creatures.updateAsync(creatureId, { $set: { writers: [], readers: [readerId, gmId, writerId] } });
    try {
      await eventually(async () => !(await client.creature())?.discordWebhookId);
      assert.notProperty(await client.creature(), 'discordWebhookId');
      assert.deepEqual(await client.settings(), OTHER_SETTINGS);
    } finally {
      await Creatures.updateAsync(creatureId, { $set: { writers: [writerId], readers: [readerId, gmId] } });
    }
  });

  it('leaves the URL out of the REST API, for its owner too; the rest of it out without a token', async function () {
    const anonymous = await fetch(Meteor.absoluteUrl(`api/creature/${creatureId}`));
    assert.equal(anonymous.status, 200);
    const text = await anonymous.text();
    for (const secret of [TOKEN, 'enc1.', SESSION.threadId, CHANNEL.channelId, '123456', PAST.threadId]) assert.notInclude(text, secret);
    assert.deepEqual(JSON.parse(text).creatures[0].settings, OTHER_SETTINGS);
    const owner = await fetch(Meteor.absoluteUrl(`api/creature/${creatureId}`), {
      headers: { Authorization: `Bearer ${await loginToken(ownerId)}` },
    });
    const ownerText = await owner.text();
    assert.equal(owner.status, 200, ownerText.slice(0, 200));
    const creature = JSON.parse(ownerText).creatures[0];
    assert.equal(creature.discordWebhookId, '123456');
    assert.deepEqual(creature.settings, OTHER_SETTINGS);
    for (const secret of [TOKEN, 'enc1.', ...sealed]) assert.notInclude(ownerText, secret);
  });

  it('no client ever received a webhook\'s token, nor its sealed URL', function () {
    const all = frames.join('\n');
    assert.include(all, '"discordWebhookId":"123456"', 'the id reaches the editors: the search proves something');
    assert.include(all, '654321', 'the party\'s id reaches its game master');
    for (const secret of [TOKEN, PARTY_TOKEN, 'enc1.', ...sealed]) assert.notInclude(all, secret);
  });
});
