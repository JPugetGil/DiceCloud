import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { DDP } from 'meteor/ddp';
import { Accounts } from 'meteor/accounts-base';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureFoldersCollection from '/imports/api/creature/creatureFolders/CreatureFolders';
import EngineActions from '/imports/api/engine/action/EngineActions';
import Libraries from '/imports/api/library/Libraries';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import VERSION from '/imports/constants/VERSION';
import { addBoardMonsters, endEncounter } from '/imports/api/creature/creatureFolders/methods/monsterMethods';
import { rollInitiative } from '/imports/api/creature/creatureFolders/methods/initiativeMethods';
import removeCreatureFolder from '/imports/api/creature/creatureFolders/methods/removeCreatureFolder';
import initiativeOrder from '/imports/api/creature/creatureFolders/initiativeOrder';
import { MAX_BOARD_MONSTERS, MAX_OWNED_MONSTERS } from '/imports/api/creature/creatureFolders/boardMonsters';
import { assertCanCreateCharacter } from '/imports/api/users/assertRolePermissions';
import { createTestCreature, removeAllCreaturesAndProps } from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import { get } from 'lodash';
import en from '/imports/ui/i18n/en.json';
import fr from '/imports/ui/i18n/fr.json';

// Untyped: the folders' schema is JavaScript
const CreatureFolders = CreatureFoldersCollection as any;

let monsterNames: typeof import('/imports/api/creature/creatureFolders/server/boardMonsters').monsterNames;
if (Meteor.isServer) {
  // Unit tests load no entry point: the publications register here
  /* eslint-disable @typescript-eslint/no-require-imports */
  require('/imports/api/creature/creatureFolders/server/publications/partyBoard');
  require('/imports/api/creature/creatureFolders/server/publications/characterCombat');
  // As in production: properties and variables leave no copy in the server's
  // mergebox, so a document sent twice reaches the client twice
  require('/imports/startup/server/publicationStrategies');
  ({ monsterNames } = require('/imports/api/creature/creatureFolders/server/boardMonsters'));
  /* eslint-enable @typescript-eslint/no-require-imports */
}

/*
 * The monsters a game master copies from a bestiary onto their party board:
 * creatures of their own, out of the character limit, deleted at the end of
 * the encounter, and of which the players see the name, picture and
 * conditions only.
 */
if (Meteor.isServer) describe('Monsters on a party board', function () {
  this.timeout(60000);

  const [gmId, playerId, strangerId] = [Random.id(), Random.id(), Random.id()];
  const userIds = [gmId, playerId, strangerId];
  const [libraryId, privateLibraryId, folderId, heroId] = [Random.id(), Random.id(), Random.id(), Random.id()];
  const [templateId, statisticsId, hitPointsNodeId, looseNodeId, dragonId] =
    [Random.id(), Random.id(), Random.id(), Random.id(), Random.id()];
  // Async: a call its schema refuses throws before it runs, which then rejects
  const as = async (method: unknown, userId: string | null, args: object): Promise<any> =>
    (method as { _execute(invocation: object, args: object): Promise<any> })._execute({ userId }, args);
  const add = (args: object = {}, userId: string | null = gmId) =>
    as(addBoardMonsters, userId, { folderId, nodeId: templateId, ...args });
  const folder = async () => (await CreatureFolders.findOneAsync(folderId)) as any;
  const props = (creatureId: string) => CreatureProperties.find(
    { 'root.id': creatureId }, { sort: { left: 1 } },
  ).fetchAsync() as Promise<any[]>;
  // The actions the tests insert
  const actionIds: string[] = [];
  const hitPoints = async (creatureId: string) =>
    (await props(creatureId)).find(prop => prop.variableName === 'hitPoints');

  async function assertRefused(promise: Promise<unknown>, error: string, message: string) {
    let thrown;
    try {
      await promise;
    } catch (e) {
      thrown = e;
    }
    assert.equal((thrown as any)?.error, error, message);
    return thrown as any;
  }

  // The board's monsters, deleted between tests
  async function removeMonsters() {
    const ids = await Creatures.find({ owner: gmId, type: 'monster' }, { fields: { _id: 1 } })
      .mapAsync(creature => creature._id);
    await CreatureProperties.removeAsync({ 'root.id': { $in: ids } });
    await CreatureVariables.removeAsync({ _creatureId: { $in: ids } });
    await Creatures.removeAsync({ _id: { $in: ids } });
    await CreatureFolders.updateAsync(folderId, {
      $set: { creatures: [heroId] }, $unset: { initiative: 1, initiativeStats: 1 },
    });
  }

  before(async function () {
    await removeAllCreaturesAndProps();
    await Meteor.users.rawCollection().insertMany(userIds.map((_id, i) => ({
      _id, createdAt: new Date(), username: `monsters-test-${i}-${_id}`,
    })) as any[]);
    // The game master's library, and someone else's private one
    await Libraries.rawCollection().insertOne({ _id: libraryId, name: 'Bestiary', owner: gmId, readers: [], writers: [] } as any);
    await Libraries.rawCollection().insertOne({
      _id: privateLibraryId, name: 'Secret', owner: strangerId, readers: [], writers: [], public: false,
    } as any);
    const root = { collection: 'libraries', id: libraryId };
    await LibraryNodes.rawCollection().insertMany([
      {
        _id: templateId, type: 'creature', name: 'Goblin', picture: 'https://example.invalid/goblin.png',
        description: { text: 'Small humanoid' }, root, left: 1, right: 16,
      },
      { _id: statisticsId, type: 'folder', name: 'Statistics', root, parentId: templateId, left: 2, right: 11 },
      {
        _id: Random.id(), type: 'attribute', attributeType: 'ability', name: 'Constitution',
        variableName: 'constitution', baseValue: { calculation: '14' }, root, parentId: statisticsId, left: 3, right: 4,
      },
      {
        _id: Random.id(), type: 'attribute', attributeType: 'ability', name: 'Dexterity',
        variableName: 'dexterity', baseValue: { calculation: '14' }, root, parentId: statisticsId, left: 5, right: 6,
      },
      // An average no roll of 2d8 + 4 gives: a rolled copy tells itself apart
      {
        _id: hitPointsNodeId, type: 'attribute', attributeType: 'healthBar', name: 'Hit Points',
        variableName: 'hitPoints', baseValue: { calculation: '50' }, root, parentId: statisticsId, left: 7, right: 8,
      },
      {
        _id: Random.id(), type: 'attribute', attributeType: 'hitDice', name: 'Hit Dice', hitDiceSize: 'd8',
        variableName: 'hitDice', baseValue: { calculation: '2' }, root, parentId: statisticsId, left: 9, right: 10,
      },
      {
        _id: Random.id(), type: 'action', name: 'Scimitar', root, parentId: templateId, left: 12, right: 13,
      },
      { _id: Random.id(), type: 'note', name: 'Deleted', removed: true, root, parentId: templateId, left: 14, right: 15 },
      { _id: looseNodeId, type: 'folder', name: 'Not a monster', root, left: 17, right: 18 },
      {
        _id: dragonId, type: 'creature', name: 'Dragon', left: 1, right: 2,
        root: { collection: 'libraries', id: privateLibraryId },
      },
    ] as any[]);
    // The party: a player and their character, which the game master may edit
    await createTestCreature({
      _id: heroId,
      name: 'Hero',
      owner: playerId,
      props: [{
        type: 'attribute', attributeType: 'healthBar', name: 'Hit Points',
        variableName: 'hitPoints', baseValue: { calculation: '30' },
      }],
    });
    await Creatures.updateAsync(heroId, { $set: { writers: [gmId], readers: [], type: 'pc' } });
    await CreatureFolders.rawCollection().insertOne({
      _id: folderId, name: 'The table', owner: gmId, members: [playerId], creatures: [heroId], order: 0,
    } as any);
  });

  afterEach(removeMonsters);

  after(async function () {
    await CreatureFolders.removeAsync(folderId);
    await EngineActions.removeAsync({ _id: { $in: actionIds } });
    await LibraryNodes.removeAsync({ 'root.id': { $in: [libraryId, privateLibraryId] } });
    await (Libraries as any).removeAsync({ _id: { $in: [libraryId, privateLibraryId] } });
    await Meteor.users.removeAsync({ _id: { $in: userIds } });
    await removeAllCreaturesAndProps();
  });

  it('adds numbered copies of the monster, without a character\'s default properties', async function () {
    const ids = await add({ count: 3 });
    assert.lengthOf(ids, 3);
    const creatures = await Creatures.find({ _id: { $in: ids } }).fetchAsync();
    assert.sameMembers(creatures.map(creature => creature.name), ['Goblin 1', 'Goblin 2', 'Goblin 3']);
    for (const creature of creatures) {
      assert.include(creature, {
        type: 'monster', owner: gmId, picture: 'https://example.invalid/goblin.png', public: false,
        computeVersion: VERSION,
      });
      assert.isEmpty(creature.readers);
      assert.isEmpty(creature.writers);
    }
    assert.includeMembers((await folder()).creatures, ids, 'on the board');

    // The template's children, with ids of their own, and nothing else
    const copied = await props(ids[0]);
    assert.deepEqual(copied.map(prop => prop.name),
      ['Statistics', 'Constitution', 'Dexterity', 'Hit Points', 'Hit Dice', 'Scimitar']);
    const nodeIds = await LibraryNodes.find({ 'root.id': libraryId }).mapAsync(node => node._id);
    for (const prop of copied) {
      assert.include(nodeIds, prop.libraryNodeId);
      assert.notInclude(nodeIds, prop._id);
    }
    const [statistics, , , , , scimitar] = copied;
    assert.notExists(statistics.parentId, 'the template\'s children are at the top level');
    assert.notExists(scimitar.parentId);
    assert.include(statistics, { left: 1, right: 10 });
    assert.include(scimitar, { left: 11, right: 12 });
    assert.equal(copied[1].parentId, statistics._id);
    // Computed, with the template's average hit points
    assert.include(await hitPoints(ids[0]), { value: 50, total: 50 });
    assert.equal(copied[1].modifier, 2);
    assert.exists(await CreatureVariables.findOneAsync({ _creatureId: ids[0] }));
  });

  it('names one of a kind alone, and numbers it after those of the board', async function () {
    const [goblin] = await add();
    assert.equal((await Creatures.findOneAsync(goblin))?.name, 'Goblin');
    const more = await add({ count: 2 });
    assert.sameMembers(
      (await Creatures.find({ _id: { $in: more } }).fetchAsync()).map(creature => creature.name),
      ['Goblin 2', 'Goblin 3'],
    );
    assert.deepEqual(monsterNames('Goblin', 1, []), ['Goblin']);
    assert.deepEqual(monsterNames('Goblin', 1, ['Goblin']), ['Goblin 2']);
    assert.deepEqual(monsterNames('Goblin', 1, ['Goblin 3', 'Goblin boss']), ['Goblin 4']);
    assert.deepEqual(monsterNames('Goblin', 2, ['Goblin boss']), ['Goblin 1', 'Goblin 2']);
  });

  it('rolls each copy\'s hit points from its hit dice when asked', async function () {
    const ids = await add({ count: 3, rollHitPoints: true });
    for (const id of ids) {
      const { total, value, baseValue } = await hitPoints(id);
      // 2d8 + 2 × the Constitution modifier (+2)
      assert.isAtLeast(total, 6);
      assert.isAtMost(total, 20);
      assert.equal(value, total);
      assert.equal(baseValue.calculation, String(total), 'its maximum');
    }
  });

  it('is the game master\'s alone', async function () {
    await assertRefused(add({}, playerId), 'monsters.denied', 'a player of the party');
    await assertRefused(add({}, strangerId), 'monsters.denied', 'someone else');
    await assertRefused(add({}, null), 'monsters.denied', 'nobody signed in');
    await assertRefused(as(endEncounter, playerId, { folderId }), 'monsters.denied', 'a player ends no encounter');
    assert.equal(await Creatures.find({ type: 'monster' }).countAsync(), 0);
  });

  it('only copies a creature template of a library the game master reads', async function () {
    await assertRefused(add({ nodeId: looseNodeId }), 'monsters.not-found', 'not a creature template');
    await assertRefused(add({ nodeId: Random.id() }), 'monsters.not-found', 'no such node');
    await assertRefused(add({ nodeId: dragonId }), 'monsters.library-denied', 'someone else\'s private library');
  });

  it('caps the monsters of a board, and of a game master', async function () {
    await assertRefused(add({ count: MAX_BOARD_MONSTERS + 1 }), 'validation-error', 'too many at once');
    // The board almost full
    const onBoard = Array.from({ length: MAX_BOARD_MONSTERS - 2 }, () => Random.id());
    await Creatures.rawCollection().insertMany(onBoard.map(_id => ({
      _id, owner: gmId, name: 'Orc', type: 'monster', readers: [], writers: [],
    })) as any[]);
    await CreatureFolders.updateAsync(folderId, { $push: { creatures: { $each: onBoard } } });
    const boardFull = await assertRefused(add({ count: 3 }), 'monsters.board-full', 'past the board\'s cap');
    // A message the board translates, which names the cap and how to make room
    assert.deepEqual(boardFull.details, {
      i18n: { key: 'monsters.errors.boardFull', params: { limit: MAX_BOARD_MONSTERS } },
    });
    assert.equal(boardFull.reason,
      `A party board holds up to ${MAX_BOARD_MONSTERS} monsters. End the encounter to make room.`);
    assert.lengthOf(await add({ count: 2 }), 2, 'up to it');
    // Monsters on other boards count towards the game master's own cap
    await CreatureFolders.updateAsync(folderId, { $set: { creatures: [heroId] } });
    const elsewhere = Array.from({ length: MAX_OWNED_MONSTERS - MAX_BOARD_MONSTERS }, () => Random.id());
    await Creatures.rawCollection().insertMany(elsewhere.map(_id => ({
      _id, owner: gmId, name: 'Orc', type: 'monster', readers: [], writers: [],
    })) as any[]);
    const limit = await assertRefused(add(), 'monsters.limit', 'past the game master\'s cap');
    assert.include(limit.reason, `up to ${MAX_OWNED_MONSTERS} monsters`);
    assert.include(limit.reason, 'delete a folder');
  });

  it('explains each refusal in English and French', function () {
    const keys = ['monsters.errors.denied', 'monsters.errors.notFound', 'monsters.errors.libraryDenied',
      'monsters.errors.boardFull', 'monsters.errors.limit', 'initiative.full'];
    for (const key of keys) {
      const english = get(en, key);
      const french = get(fr, key);
      assert.isString(english, `${key} in en.json`);
      assert.isString(french, `${key} in fr.json`);
      assert.equal(english.includes('{limit}'), french.includes('{limit}'), `${key}: the same parameters`);
    }
    for (const key of ['monsters.errors.boardFull', 'monsters.errors.limit', 'initiative.full']) {
      assert.include(get(en, key), '{limit}', `${key} names the cap`);
    }
  });

  it('does not count the monsters towards the character limit', async function () {
    // A player owns up to 2 characters: the game master owns none, and monsters
    await add({ count: 3 });
    await assertCanCreateCharacter(gmId);
  });

  it('rolls monsters into a fight under way, without rerolling the others', async function () {
    // No fight yet: the monsters wait for the roll
    await add();
    assert.notExists((await folder()).initiative);
    await as(rollInitiative, gmId, { folderId });
    const before = (await folder()).initiative;
    const current = initiativeOrder(before.entries)[before.turn];
    const ids = await add({ count: 2, sharedInitiative: true });
    const after = (await folder()).initiative;
    for (const entry of before.entries) assert.deepInclude(after.entries, entry, `${entry.name} keeps its result`);
    const joined = after.entries.filter(entry => ids.includes(entry.creatureId));
    assert.sameMembers(joined.map(entry => entry.name), ['Goblin 2', 'Goblin 3']);
    assert.equal(joined[0].roll, joined[1].roll, 'one roll for the group');
    assert.equal(joined[0].bonus, 2, 'their Dexterity modifier');
    assert.equal(initiativeOrder(after.entries)[after.turn]._id, current._id, 'the turn stays put');
    // No hit points in the tracker, which the players receive
    for (const entry of joined) assert.hasAllKeys(entry, ['_id', 'creatureId', 'name', 'bonus', 'roll', 'initiative']);
  });

  it('ends the encounter: the monsters go, the characters stay', async function () {
    const npcId = Random.id();
    await Creatures.rawCollection().insertOne({
      _id: npcId, owner: gmId, name: 'Innkeeper', type: 'npc', readers: [], writers: [],
    } as any);
    await CreatureFolders.updateAsync(folderId, { $push: { creatures: npcId } });
    const ids = await add({ count: 2 });
    await as(rollInitiative, gmId, { folderId });
    // The hero's turn
    const { entries } = (await folder()).initiative;
    const heroTurn = initiativeOrder(entries).findIndex(entry => entry.creatureId === heroId);
    await CreatureFolders.updateAsync(folderId, { $set: { 'initiative.turn': heroTurn } });

    assert.equal(await as(endEncounter, gmId, { folderId }), 2);
    assert.equal(await Creatures.find({ _id: { $in: ids } }).countAsync(), 0);
    assert.equal(await CreatureProperties.find({ 'root.id': { $in: ids } }).countAsync(), 0);
    assert.equal(await CreatureVariables.find({ _creatureId: { $in: ids } }).countAsync(), 0);
    const after = await folder();
    assert.sameMembers(after.creatures, [heroId, npcId], 'the characters and the NPC stay');
    assert.notIncludeMembers(after.initiative.entries.map(entry => entry.creatureId), ids);
    assert.equal(initiativeOrder(after.initiative.entries)[after.initiative.turn].creatureId, heroId,
      'still the hero\'s turn');

    // And the end of the combat, when asked
    await add();
    assert.equal(await as(endEncounter, gmId, { folderId, endCombat: true }), 1);
    assert.notExists((await folder()).initiative);
    await Creatures.removeAsync(npcId);
  });

  it('deletes the board\'s monsters with its folder', async function () {
    const otherFolderId = Random.id();
    await CreatureFolders.rawCollection().insertOne({
      _id: otherFolderId, name: 'One-shot', owner: gmId, members: [], creatures: [], order: 1,
    } as any);
    const ids = await as(addBoardMonsters, gmId, { folderId: otherFolderId, nodeId: templateId, count: 2 });
    await as(removeCreatureFolder, gmId, { _id: otherFolderId });
    assert.notExists(await CreatureFolders.findOneAsync(otherFolderId));
    assert.equal(await Creatures.find({ _id: { $in: ids } }).countAsync(), 0);
  });

  /**
   * A DDP connection of the user's to the test server, with every message
   * it receives, parsed
   */
  async function openAs(userId: string) {
    const connection = DDP.connect(Meteor.absoluteUrl());
    const messages: any[] = [];
    (connection as any)._stream.on('message', (raw: string) => messages.push(JSON.parse(raw)));
    const accounts = Accounts as any;
    const stamped = accounts._generateStampedLoginToken();
    await accounts._insertLoginToken(userId, stamped);
    await connection.callAsync('login', { resume: stamped.token });
    const subscribe = (name: string, ...args: any[]) => new Promise((resolve, reject) => connection.subscribe(name, ...args, {
      onReady: resolve,
      onStop: (error: unknown) => error && reject(error),
    }));
    return { connection, messages, subscribe };
  }
  // What a connection received of a document: every message about it
  const about = (messages: any[], collection: string, id: string) => messages
    .filter(message => message.collection === collection && message.id === id);
  const fieldsOf = (messages: any[], collection: string, id: string) => about(messages, collection, id)
    .flatMap(message => Object.keys(message.fields || {}));

  it('sends a player of the party nothing of a monster but its name, picture, type and conditions', async function () {
    const [goblinId] = await add({ count: 2 });
    // A condition and another buff on the goblin, and an action it started
    const proneId = await CreatureProperties.insertAsync({
      type: 'buff', name: 'Prone', tags: ['condition', 'proneCondition'],
      root: { collection: 'creatures', id: goblinId }, left: 100, right: 101,
    } as any);
    const blessId = await CreatureProperties.insertAsync({
      type: 'buff', name: 'Bless', tags: [], root: { collection: 'creatures', id: goblinId }, left: 102, right: 103,
    } as any);
    const actionId = Random.id();
    actionIds.push(actionId);
    await EngineActions.rawCollection().insertOne({ _id: actionId, creatureId: goblinId, results: [], taskCount: 0 } as any);
    await as(rollInitiative, gmId, { folderId });
    const goblinHitPoints = await hitPoints(goblinId);
    const goblinVariables = await CreatureVariables.findOneAsync({ _creatureId: goblinId }) as any;
    const heroVariables = await CreatureVariables.findOneAsync({ _creatureId: heroId }) as any;
    const heroHitPoints = await hitPoints(heroId);

    const player = await openAs(playerId);
    const gm = await openAs(gmId);
    try {
      await player.subscribe('partyBoard', folderId);
      await player.subscribe('characterCombat', heroId);
      await gm.subscribe('partyBoard', folderId);
      // The goblin is hurt while the board is open
      await CreatureProperties.updateAsync(goblinHitPoints._id, { $set: { damage: 3, dirty: true } }, {
        selector: { type: 'attribute' },
      });
      for (let i = 0; i < 50 && !about(gm.messages, 'creatureProperties', goblinHitPoints._id)
        .some(message => message.fields?.damage === 3); i += 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.isTrue(about(gm.messages, 'creatureProperties', goblinHitPoints._id)
        .some(message => message.fields?.damage === 3), 'the game master sees the damage');

      // The player sees the goblin's name, picture and type, and no other field
      assert.includeMembers(fieldsOf(player.messages, 'creatures', goblinId), ['name', 'picture', 'type']);
      assert.includeMembers(['name', 'color', 'picture', 'avatarPicture', 'owner', 'writers', 'type', 'computeVersion'],
        fieldsOf(player.messages, 'creatures', goblinId));
      // Its condition, not its other buff
      assert.isNotEmpty(about(player.messages, 'creatureProperties', proneId), 'its condition');
      assert.isEmpty(about(player.messages, 'creatureProperties', blessId), 'no other buff');
      // Nothing else of it: no property, no hit points, no variables, no action
      const goblinProps = await CreatureProperties.find({ 'root.id': goblinId }).mapAsync(prop => prop._id);
      const received = player.messages.filter(message => message.collection === 'creatureProperties'
        && goblinProps.includes(message.id));
      assert.deepEqual([...new Set(received.map(message => message.id))], [proneId]);
      assert.isEmpty(about(player.messages, 'creatureVariables', goblinVariables._id), 'no variables');
      assert.isFalse(player.messages.some(message => message.fields?._creatureId === goblinId), 'no variables');
      assert.isEmpty(about(player.messages, 'actions', actionId), 'no action in progress');
      const raw = JSON.stringify(player.messages);
      assert.notInclude(raw, goblinHitPoints._id, 'no message names its hit points');
      assert.notInclude(raw, 'initiativeStats');
      // The tracker it is in carries no hit points
      const trackers = player.messages.filter(message => message.collection === 'creatureFolders'
        && message.fields?.initiative);
      assert.isNotEmpty(trackers, 'the tracker reached the player');
      for (const message of trackers) {
        for (const entry of message.fields.initiative.entries) {
          assert.hasAllKeys(entry, ['_id', 'creatureId', 'name', 'bonus', 'roll', 'initiative']);
        }
      }

      // The player still gets their own character's, the game master the goblin's
      assert.isNotEmpty(about(player.messages, 'creatureVariables', heroVariables._id), 'the hero\'s variables');
      assert.isNotEmpty(about(player.messages, 'creatureProperties', heroHitPoints._id), 'the hero\'s hit points');
      assert.isNotEmpty(about(gm.messages, 'creatureVariables', goblinVariables._id), 'the game master gets them');
      assert.isNotEmpty(about(gm.messages, 'creatureProperties', blessId));
      assert.isNotEmpty(about(gm.messages, 'actions', actionId));
    } finally {
      player.connection.disconnect();
      gm.connection.disconnect();
    }
  });

  it('sends the game master a turn, not the board again', async function () {
    await add({ count: 3 });
    await as(rollInitiative, gmId, { folderId });
    const gm = await openAs(gmId);
    try {
      await gm.subscribe('partyBoard', folderId);
      const received = gm.messages.length;
      await CreatureFolders.updateAsync(folderId, { $inc: { 'initiative.turn': 1 } });
      await new Promise(resolve => setTimeout(resolve, 500));
      const after = gm.messages.slice(received).filter(message => message.collection);
      assert.deepEqual(after.map(message => `${message.msg} ${message.collection}`), ['changed creatureFolders'],
        'the tracker alone, not every creature\'s variables again');
    } finally {
      gm.connection.disconnect();
    }
  });
});
