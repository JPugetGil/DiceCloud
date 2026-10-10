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
  creatureWithoutWebhook, settingsFieldsWithoutWebhook,
} from '/imports/api/creature/creatures/webhookVisibility';

if (Meteor.isServer) {
  // Unit tests load no entry point: the publications and the REST API under
  // test register here, on the server only
  /* eslint-disable @typescript-eslint/no-require-imports */
  require('/imports/api/creature/creatures/server/publications/singleCharacter');
  require('/imports/api/creature/creatures/server/publications/characterList');
  require('/imports/api/creature/creatureFolders/server/publications/partyBoard');
  require('/imports/api/rest/server/index');
  /* eslint-enable @typescript-eslint/no-require-imports */
}

const WEBHOOK = 'https://discord.com/api/webhooks/123456/secret-token';
const OTHER_SETTINGS = { hitDiceResetMultiplier: 0.5, hideSpellsTab: true };
// A session's ids are the editors' too
const SESSION = { webhookId: '123456', kind: 'forum', threadId: '777000111', messageId: '777000111', startedAt: new Date() };
// The party's own, the game master's alone; the players get the summary
const PARTY_DISCORD = {
  webhook: 'https://discord.com/api/webhooks/654321/party-secret',
  session: { ...SESSION, webhookId: '654321', threadId: '888000222', messageId: '888000222' },
  initiative: { webhookId: '654321', messageId: '888000333' },
};

describe('Who gets a character\'s Discord webhook (webhookVisibility)', function () {
  it('lists every setting but the webhook', function () {
    const fields = settingsFieldsWithoutWebhook();
    assert.notProperty(fields, 'settings.discordWebhook');
    assert.include(Object.keys(fields), 'settings.hitDiceResetMultiplier');
    assert.include(Object.keys(fields), 'settings.hideUnusedStats');
    assert.lengthOf(Object.keys(fields), 9);
  });

  it('copies a character without its webhook and its session', function () {
    const creature = { _id: 'a', settings: { discordWebhook: WEBHOOK, ...OTHER_SETTINGS }, discordSession: SESSION };
    assert.deepEqual<object>(creatureWithoutWebhook(creature), { _id: 'a', settings: OTHER_SETTINGS });
    assert.equal(creature.settings.discordWebhook, WEBHOOK, 'the original is untouched');
    assert.deepEqual<object>(creatureWithoutWebhook({ _id: 'c', settings: {}, discordSession: SESSION }), { _id: 'c', settings: {} });
    const without = { _id: 'b', settings: {} };
    assert.strictEqual(creatureWithoutWebhook(without), without);
  });
});

if (Meteor.isServer) describe('Publications and the REST API leave the webhook to editors', function () {
  this.timeout(30000);
  const [ownerId, writerId, readerId, gmId, strangerId, memberId] = [
    Random.id(), Random.id(), Random.id(), Random.id(), Random.id(), Random.id(),
  ];
  const userIds = [ownerId, writerId, readerId, gmId, strangerId, memberId];
  const [creatureId, folderId] = [Random.id(), Random.id()];
  let connections: any[] = [];

  before(async function () {
    await Meteor.users.rawCollection().insertMany(userIds.map((_id, i) => ({
      _id, createdAt: new Date(), username: `webhook-test-${i}-${_id}`,
    })) as any[]);
    await Creatures.rawCollection().insertOne({
      _id: creatureId, name: 'Aria', type: 'pc', owner: ownerId, writers: [writerId], readers: [readerId, gmId],
      public: true, computeVersion: VERSION, settings: { discordWebhook: WEBHOOK, ...OTHER_SETTINGS },
      discordSession: SESSION,
    } as any);
    await CreatureFolders.rawCollection().insertOne({
      _id: folderId, name: 'The table', owner: gmId, creatures: [creatureId], members: [memberId], order: 0,
      discord: PARTY_DISCORD, discordPosting: { rolls: true, combat: true },
    } as any);
  });

  afterEach(function () {
    connections.forEach(connection => connection.disconnect());
    connections = [];
  });

  after(async function () {
    await CreatureFolders.removeAsync(folderId);
    await Creatures.removeAsync(creatureId);
    await Meteor.users.removeAsync({ _id: { $in: userIds } });
  });

  /** A DDP client of this server, signed in as the user if one is given */
  async function clientOf(userId?: string) {
    const connection = DDP.connect(Meteor.absoluteUrl());
    connections.push(connection);
    if (userId) {
      const accounts = Accounts as any;
      const stamped = accounts._generateStampedLoginToken();
      await accounts._insertLoginToken(userId, stamped);
      await connection.callAsync('login', { resume: stamped.token });
    }
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

  it('sends it to those who may edit the character, with its session', async function () {
    for (const userId of [ownerId, writerId]) {
      const client = await clientOf(userId);
      await client.subscribe('singleCharacter', creatureId);
      assert.deepEqual(await client.settings(), { discordWebhook: WEBHOOK, ...OTHER_SETTINGS });
      assert.equal((await client.creature())?.discordSession?.threadId, SESSION.threadId);
    }
  });

  it('sends the other settings, not the webhook nor its session, to a reader and to anyone reading a public character', async function () {
    for (const userId of [readerId, strangerId, undefined]) {
      const client = await clientOf(userId);
      await client.subscribe('singleCharacter', creatureId);
      assert.deepEqual(await client.settings(), OTHER_SETTINGS, `user ${userId}`);
      assert.notProperty(await client.creature(), 'discordSession', `user ${userId}`);
    }
  });

  it('sends the party\'s webhook and session to its game master alone; the players learn what it posts', async function () {
    const gm = await clientOf(gmId);
    await gm.subscribe('partyBoard', folderId);
    assert.equal((await gm.folder())?.discord?.webhook, PARTY_DISCORD.webhook);
    const member = await clientOf(memberId);
    await member.subscribe('partyBoard', folderId);
    await member.subscribe('characterList');
    const seen = await member.folder();
    assert.equal(seen?.name, 'The table', 'the member reads the board');
    assert.notProperty(seen, 'discord');
    assert.deepEqual(seen?.discordPosting, { rolls: true, combat: true });
    assert.notInclude(JSON.stringify(seen), 'party-secret');
    // Nor the character's session, which the board leaves out for the game master too
    assert.notProperty(await gm.creature(), 'discordSession');
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
  });

  it('takes it back from a writer who becomes a reader', async function () {
    const client = await clientOf(writerId);
    await client.subscribe('singleCharacter', creatureId);
    assert.equal((await client.settings())?.discordWebhook, WEBHOOK);
    await Creatures.updateAsync(creatureId, { $set: { writers: [], readers: [readerId, gmId, writerId] } });
    try {
      await eventually(async () => !(await client.settings())?.discordWebhook);
      assert.deepEqual(await client.settings(), OTHER_SETTINGS);
    } finally {
      await Creatures.updateAsync(creatureId, { $set: { writers: [writerId], readers: [readerId, gmId] } });
    }
  });

  it('leaves it out of the REST API without a token', async function () {
    const response = await fetch(Meteor.absoluteUrl(`api/creature/${creatureId}`));
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.notInclude(text, 'secret-token');
    assert.notInclude(text, SESSION.threadId);
    assert.deepEqual(JSON.parse(text).creatures[0].settings, OTHER_SETTINGS);
  });
});
