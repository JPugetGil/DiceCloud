import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { DDP } from 'meteor/ddp';
import { MongoInternals } from 'meteor/mongo';
import { Accounts } from 'meteor/accounts-base';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureFoldersCollection from '/imports/api/creature/creatureFolders/CreatureFolders';
import Libraries from '/imports/api/library/Libraries';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import { removePartyMember } from '/imports/api/creature/creatureFolders/methods/partyMethods';
import VERSION from '/imports/constants/VERSION';

// Untyped: the folders' schema is JavaScript
const CreatureFolders = CreatureFoldersCollection as any;

if (Meteor.isServer) {
  // Unit tests load no entry point: the publications register here
  /* eslint-disable @typescript-eslint/no-require-imports */
  require('/imports/api/creature/creatureFolders/server/publications/partyBoard');
  require('/imports/api/creature/creatures/server/publications/singleCharacter');
  require('/imports/api/library/server/publications/searchLibraryNodes');
  // As in production: properties leave no copy in the server's mergebox, so
  // every observer that sends one reaches the client
  require('/imports/startup/server/publicationStrategies');
  /* eslint-enable @typescript-eslint/no-require-imports */
}

/*
 * The publications that rerun when what they read changes
 * (reactivePublication.js), over real DDP connections to the test server: a
 * user who loses access receives nothing more, and a rerun leaves no observer
 * behind. reactive-publish 1.1.1's `this.autorun` failed both.
 */
if (Meteor.isServer) describe('Reactive publications', function () {
  this.timeout(60000);

  const [gmId, playerId, readerId, strangerId] = [Random.id(), Random.id(), Random.id(), Random.id()];
  const userIds = [gmId, playerId, readerId, strangerId];
  // The game master's character and the player's, on the game master's board;
  // a character shared with a reader, and a public one
  const [sageId, heroId, ariaId, bardId, folderId] = [Random.id(), Random.id(), Random.id(), Random.id(), Random.id()];
  const creatureIds = [sageId, heroId, ariaId, bardId];
  // And a library of the game master's, with spells to search
  const libraryId = Random.id();
  const fixtureIds = [...creatureIds, folderId, libraryId];
  let connections: any[] = [];
  let subscriptions: any[] = [];

  before(async function () {
    await Meteor.users.rawCollection().insertMany(userIds.map((_id, i) => ({
      _id, createdAt: new Date(), username: `reactive-publication-test-${i}-${_id}`,
    })) as any[]);
    const character = (_id: string, name: string, owner: string, more = {}) => ({
      _id, name, owner, type: 'pc', readers: [], writers: [], public: false, computeVersion: VERSION, ...more,
    });
    await Creatures.rawCollection().insertMany([
      character(sageId, 'Sage', gmId),
      character(heroId, 'Hero', playerId),
      character(ariaId, 'Aria', gmId, { readers: [readerId] }),
      character(bardId, 'Bard', gmId, { public: true }),
    ] as any[]);
    // What the board shows of each, and a note it doesn't
    await CreatureProperties.rawCollection().insertMany(creatureIds.flatMap(id => [
      {
        _id: Random.id(), type: 'attribute', attributeType: 'healthBar', name: 'Hit Points', variableName: 'hitPoints',
        value: 10, total: 10, root: { collection: 'creatures', id }, left: 1, right: 2,
      },
      { _id: Random.id(), type: 'buff', name: 'Blessed', root: { collection: 'creatures', id }, left: 3, right: 4 },
      { _id: Random.id(), type: 'note', name: 'Notes', root: { collection: 'creatures', id }, left: 5, right: 6 },
    ]) as any[]);
    await Libraries.rawCollection().insertOne({
      _id: libraryId, name: 'Spells', owner: gmId, readers: [], writers: [], public: false,
    } as any);
    await LibraryNodes.rawCollection().insertMany(['Fire Bolt', 'Fireball', 'Shield'].map((name, i) => ({
      _id: Random.id(), type: 'spell', name, searchable: true,
      root: { collection: 'libraries', id: libraryId }, left: 2 * i + 1, right: 2 * i + 2,
    })) as any[]);
  });

  // The party as it starts each test: the player joined with their character
  beforeEach(async function () {
    await CreatureFolders.removeAsync(folderId);
    await CreatureFolders.rawCollection().insertOne({
      _id: folderId, name: 'The table', owner: gmId, members: [playerId], creatures: [sageId, heroId], order: 0,
    });
    await Creatures.rawCollection().updateOne({ _id: heroId }, { $set: { writers: [gmId] } });
    await Creatures.rawCollection().updateOne({ _id: ariaId }, { $set: { readers: [readerId] } });
    await Creatures.rawCollection().updateOne({ _id: bardId }, { $set: { public: true } });
  });

  // Unsubscribed before disconnecting: the server notices a closed socket
  // later, and the next test counts the observers
  afterEach(async function () {
    subscriptions.forEach(subscription => subscription.stop());
    subscriptions = [];
    await eventually(() => observers() === 0, 10000);
    connections.forEach(connection => connection.disconnect());
    connections = [];
  });

  after(async function () {
    await CreatureFolders.removeAsync(folderId);
    await CreatureProperties.removeAsync({ 'root.id': { $in: creatureIds } });
    await Creatures.removeAsync({ _id: { $in: creatureIds } });
    await LibraryNodes.removeAsync({ 'root.id': libraryId });
    await (Libraries as any).removeAsync(libraryId);
    await Meteor.users.removeAsync({ _id: { $in: userIds } });
  });

  /** A DDP client of this server signed in as the user, with every message it receives */
  async function clientOf(userId: string) {
    const connection = DDP.connect(Meteor.absoluteUrl());
    connections.push(connection);
    const messages: any[] = [];
    (connection as any)._stream.on('message', (raw: string) => messages.push(JSON.parse(raw)));
    const accounts = Accounts as any;
    const stamped = accounts._generateStampedLoginToken();
    await accounts._insertLoginToken(userId, stamped);
    await connection.callAsync('login', { resume: stamped.token });
    const subscribe = (name: string, ...args: any[]) => new Promise<any>((resolve, reject) => {
      const handle = connection.subscribe(name, ...args, {
        onReady: () => resolve(handle),
        onStop: (error: unknown) => error && reject(error),
      });
      subscriptions.push(handle);
    });
    // The documents the client holds, by collection
    const holds = (collection: string) => {
      const ids = new Set<string>();
      for (const message of messages) {
        if (message.collection !== collection) continue;
        if (message.msg === 'added') ids.add(message.id);
        if (message.msg === 'removed') ids.delete(message.id);
      }
      return ids;
    };
    return { connection, messages, subscribe, holds };
  }

  async function eventually(condition: () => boolean | Promise<boolean>, timeout = 5000) {
    const start = Date.now();
    while (!await condition()) {
      if (Date.now() - start > timeout) return false;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return true;
  }

  // Until no message has arrived for 300 ms
  async function settle(messages: any[]) {
    let count = -1;
    await eventually(async () => {
      const quiet = count === messages.length;
      count = messages.length;
      if (!quiet) await new Promise(resolve => setTimeout(resolve, 300));
      return quiet;
    }, 10000);
  }

  // The server's live observers of the fixture's documents
  function observers() {
    const multiplexers = (MongoInternals.defaultRemoteCollectionDriver().mongo as any)._observeMultiplexers;
    let count = 0;
    for (const [key, multiplexer] of Object.entries<any>(multiplexers)) {
      if (fixtureIds.some(id => key.includes(id))) count += Object.keys(multiplexer._handles || {}).length;
    }
    return count;
  }

  const propertyIds = async (creatureId: string) =>
    CreatureProperties.find({ 'root.id': creatureId }).mapAsync(prop => prop._id);
  const addBuff = (creatureId: string) => CreatureProperties.insertAsync({
    type: 'buff', name: 'Frightened', tags: ['condition'],
    root: { collection: 'creatures', id: creatureId }, left: 100, right: 101,
  } as any);

  /**
   * Once the client has lost access: what the creature's owner then does to
   * it sends the client nothing, and it holds none of its documents
   */
  async function assertNothingMoreAbout(client: Awaited<ReturnType<typeof clientOf>>, creatureId: string) {
    await settle(client.messages);
    const received = client.messages.length;
    const hitPoints = await CreatureProperties.findOneAsync({ 'root.id': creatureId, variableName: 'hitPoints' });
    const buffId = await addBuff(creatureId);
    await CreatureProperties.updateAsync(hitPoints!._id, { $set: { damage: 4 } }, { selector: { type: 'attribute' } } as any);
    await Creatures.updateAsync(creatureId, { $set: { name: 'Renamed' } });
    await settle(client.messages);
    await new Promise(resolve => setTimeout(resolve, 500));
    const after = client.messages.slice(received).filter(message => message.collection);
    assert.deepEqual(after.map(message => `${message.msg} ${message.collection}`), [], 'no message after the access is gone');
    assert.notInclude([...client.holds('creatures')], creatureId);
    for (const id of [...await propertyIds(creatureId), buffId]) {
      assert.notInclude([...client.holds('creatureProperties')], id);
    }
    await CreatureProperties.removeAsync(buffId);
    await Creatures.updateAsync(creatureId, { $set: { name: 'Sage' } });
  }

  it('sends a player removed from the party nothing more of the board', async function () {
    const player = await clientOf(playerId);
    await player.subscribe('partyBoard', folderId);
    assert.include([...player.holds('creatures')], sageId, 'the game master\'s character, while a member');
    const blessed = await CreatureProperties.findOneAsync({ 'root.id': sageId, type: 'buff' });
    assert.include([...player.holds('creatureProperties')], blessed!._id);

    await (removePartyMember as any)._execute({ userId: gmId }, { folderId, userId: playerId });
    assert.isTrue(await eventually(() => !player.holds('creatureFolders').has(folderId)), 'the board leaves the client');
    await assertNothingMoreAbout(player, sageId);
  });

  it('sends a reader taken off a character\'s sharing nothing more of its sheet', async function () {
    const reader = await clientOf(readerId);
    await reader.subscribe('singleCharacter', ariaId);
    assert.includeMembers([...reader.holds('creatureProperties')], await propertyIds(ariaId));

    await Creatures.updateAsync(ariaId, { $set: { readers: [] } });
    assert.isTrue(await eventually(() => !reader.holds('creatures').has(ariaId)), 'the character leaves the client');
    await assertNothingMoreAbout(reader, ariaId);
  });

  it('sends nothing more of a character made private to those it is not shared with', async function () {
    const stranger = await clientOf(strangerId);
    await stranger.subscribe('singleCharacter', bardId);
    assert.includeMembers([...stranger.holds('creatureProperties')], await propertyIds(bardId));

    await Creatures.updateAsync(bardId, { $set: { public: false } });
    assert.isTrue(await eventually(() => !stranger.holds('creatures').has(bardId)), 'the character leaves the client');
    await assertNothingMoreAbout(stranger, bardId);
  });

  it('leaves no observer behind when it reruns, and stops them all with the subscription', async function () {
    const before = observers();
    const gm = await clientOf(gmId);
    const board = await gm.subscribe('partyBoard', folderId);
    const sheet = await gm.subscribe('singleCharacter', sageId);
    await settle(gm.messages);
    const running = observers();
    assert.isAbove(running, before);

    // Each a rerun of both, whose access stays the same: someone who is not a
    // user joins the party and leaves, and is given the character to read
    const ghostId = Random.id();
    const counts: number[] = [];
    for (let i = 1; i <= 10; i += 1) {
      const received = gm.messages.length;
      const change = i % 2 ? '$push' : '$pull';
      await CreatureFolders.updateAsync(folderId, { [change]: { members: ghostId } });
      await Creatures.updateAsync(sageId, { [change]: { readers: ghostId } });
      // A rerun sends the properties again
      assert.isTrue(await eventually(() => gm.messages.slice(received)
        .some(message => message.msg === 'changed' && message.collection === 'creatureProperties')), `rerun ${i}`);
      await settle(gm.messages);
      await eventually(() => observers() === running, 2000);
      counts.push(observers());
    }
    assert.deepEqual(counts, Array(10).fill(running), 'as many observers after each rerun');

    // The latest run's observers keep the client up to date, once each
    const received = gm.messages.length;
    const hitPoints = await CreatureProperties.findOneAsync({ 'root.id': sageId, variableName: 'hitPoints' });
    await CreatureProperties.updateAsync(hitPoints!._id, { $set: { damage: 2 } }, { selector: { type: 'attribute' } } as any);
    assert.isTrue(await eventually(() => gm.messages.slice(received).some(message => message.fields?.damage === 2)));
    await settle(gm.messages);
    const updates = gm.messages.slice(received).filter(message => message.id === hitPoints!._id);
    // Both subscriptions publish it
    assert.isAtMost(updates.length, 2, 'one update per subscription, not one per run');

    board.stop();
    sheet.stop();
    assert.isTrue(await eventually(() => observers() === before), `back to ${before} observers, not ${observers()}`);
  });

  it('reruns when the client changes the subscription\'s data, and then settles', async function () {
    const gm = await clientOf(gmId);
    const search = await gm.subscribe('searchLibraryNodes');
    const results = () => gm.messages.filter(message => message.collection === 'libraryNodes')
      .reduce((ids, message) => {
        if (message.msg === 'added' && message.fields._searchResult) ids.add(message.id);
        if (message.msg === 'removed') ids.delete(message.id);
        return ids;
      }, new Set<string>()).size;
    assert.equal(results(), 0, 'no type, no search');
    // What the client's setData calls
    const setData = (path: string, value: unknown) => gm.connection.callAsync('_subscriptionDataSet', search.subscriptionId, path, value);

    await setData('type', 'spell');
    assert.isTrue(await eventually(() => results() === 3), `the spells, not ${results()}`);
    await setData('searchTerm', 'fire');
    assert.isTrue(await eventually(() => results() === 2), `the fire spells, not ${results()}`);
    // Settled: no run starts the next one
    await settle(gm.messages);
    const running = observers();
    const data = () => gm.messages.filter(message => message.collection).length;
    const received = data();
    await new Promise(resolve => setTimeout(resolve, 1000));
    assert.equal(data(), received, 'nothing more sent');
    assert.equal(observers(), running);
  });
});
