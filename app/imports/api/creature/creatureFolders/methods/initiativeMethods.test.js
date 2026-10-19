import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { Mongo } from 'meteor/mongo';
import initiativeOrder, {
  turnAfterChange, trackerWithout, trackerAsRead, MAX_INITIATIVE_ENTRIES,
} from '/imports/api/creature/creatureFolders/initiativeOrder';
import {
  rollInitiative, addInitiativeEntry, updateInitiativeEntry, removeInitiativeEntry,
  advanceInitiative, endInitiative, damageInitiativeEntry, setInitiativeEntryOut,
  addCreaturesToInitiative,
} from '/imports/api/creature/creatureFolders/methods/initiativeMethods';
import {
  entryStatus, numberedNames, damageAfter, boardFolderFields,
} from '/imports/api/creature/creatureFolders/initiativeCreatures';

// Partial documents, as a test needs them: into the database as they are, past
// the schema and the documents' types
const insertRaw = (collection, doc) => collection.rawCollection().insertOne(doc);

describe('Initiative order', function () {
  it('puts the highest result first, ties to the highest bonus, unrolled last', function () {
    const order = initiativeOrder([
      { name: 'Unrolled', bonus: 9 },
      { name: 'Low', initiative: 5, bonus: 0 },
      { name: 'Tie, small bonus', initiative: 15, bonus: 1 },
      { name: 'Tie, big bonus', initiative: 15, bonus: 4 },
    ]);
    assert.deepEqual(order.map(entry => entry.name), ['Tie, big bonus', 'Tie, small bonus', 'Low', 'Unrolled']);
  });
});

describe('The turn after a change of order', function () {
  const entries = [
    { _id: 'a', name: 'A', initiative: 15 },
    { _id: 'b', name: 'B', initiative: 10 },
    { _id: 'c', name: 'C', initiative: 5 },
  ];
  it('stays with the same creature when a result moves someone ahead of it', function () {
    // B's turn (index 1); C now rolls 20 and comes first: still B's turn
    const changed = entries.map(entry => entry._id === 'c' ? { ...entry, initiative: 20 } : entry);
    assert.equal(turnAfterChange(entries, 1, changed), 2);
  });
  it('stays with the same creature when one is added', function () {
    assert.equal(turnAfterChange(entries, 0, [...entries, { _id: 'd', initiative: 30 }]), 1);
  });
  it('stays in range when the creature has gone', function () {
    assert.equal(turnAfterChange(entries, 2, entries.slice(0, 2)), 1);
  });
});

describe('The tracker once entries leave it', function () {
  // A (20), B (15), C (10), D (5)
  const entries = ['a', 'b', 'c', 'd'].map((_id, i) => ({ _id, name: _id.toUpperCase(), initiative: 20 - 5 * i }));
  const at = (turn, round = 1) => ({ round, turn, entries });
  const leave = (tracker, ids) => {
    const { entries: kept, turn, round, started } = trackerWithout(tracker, ids);
    return { kept: initiativeOrder(kept).map(entry => entry._id).join(''), turn, round, started: started?._id };
  };

  it('keeps the turn on the creature whose turn it is', function () {
    assert.deepEqual(leave(at(2), ['a', 'd']), { kept: 'bc', turn: 1, round: 1, started: undefined });
  });
  it('passes the turn to the next one when it leaves, whose turn starts', function () {
    assert.deepEqual(leave(at(1), ['b']), { kept: 'acd', turn: 1, round: 1, started: 'c' });
  });
  it('passes it once, to the next one that stays, however many leave at once', function () {
    assert.deepEqual(leave(at(0), ['a', 'b', 'd']), { kept: 'c', turn: 0, round: 1, started: 'c' });
  });
  it('starts the next round with the first when the last ones of the round leave', function () {
    assert.deepEqual(leave(at(2, 3), ['c', 'd']), { kept: 'ab', turn: 0, round: 4, started: 'a' });
  });
  it('starts no turn when all leave, nor before the fight', function () {
    assert.deepEqual(leave(at(1), ['a', 'b', 'c', 'd']), { kept: '', turn: 0, round: 1, started: undefined });
    assert.deepEqual(leave(at(0, 0), ['a']), { kept: 'bcd', turn: 0, round: 0, started: undefined });
  });
  it('selects the folder while its tracker is still as read, in Minimongo too (the client\'s simulation of Next)', async function () {
    // any: Meteor's modifier types refuse dotted paths on an untyped collection
    const folders = /** @type {any} */ (new Mongo.Collection(null));
    await folders.insertAsync({ _id: 'f', initiative: at(1) });
    const asRead = { _id: 'f', ...trackerAsRead(at(1)) };
    assert.exists(await folders.findOneAsync(asRead));
    // A turn's mark changes nothing
    await folders.updateAsync({ _id: 'f', 'initiative.entries._id': 'c' }, { $set: { 'initiative.entries.$.startedRound': 1 } });
    assert.exists(await folders.findOneAsync(asRead));
    // An entry gone, or another in its place
    await folders.updateAsync('f', { $pull: { 'initiative.entries': { _id: 'd' } } });
    assert.notExists(await folders.findOneAsync(asRead));
    await folders.updateAsync('f', { $push: { 'initiative.entries': { _id: 'e', initiative: 1 } } });
    assert.notExists(await folders.findOneAsync(asRead));
  });
});

describe('Initiative tracker', function () {
  const [userId, otherUserId, folderId, fighterId, wizardId] =
    [Random.id(), Random.id(), Random.id(), Random.id(), Random.id()];
  // Late to the fight: not in the folder when it rolls
  const [rogueId, twinIds, strangerId] = [Random.id(), [Random.id(), Random.id()], Random.id()];
  const lateIds = [rogueId, ...twinIds, strangerId];
  const as = (method, args, user = userId) => method._execute({ userId: user }, { folderId, ...args });
  const tracker = async () => (await CreatureFolders.findOneAsync(folderId)).initiative;
  const ordered = async () => initiativeOrder((await tracker()).entries);

  before(async function () {
    if (!Meteor.isServer) this.skip();
    await Meteor.users.insertAsync({ _id: userId, username: `test-${userId}` });
    for (const [_id, name] of [[fighterId, 'Fighter'], [wizardId, 'Wizard'], [rogueId, 'Rogue'],
      [twinIds[0], 'Twin 1'], [twinIds[1], 'Twin 2']]) {
      await insertRaw(Creatures, { _id, name, owner: userId, readers: [], writers: [] });
    }
    // Another user's, which the game master can't view
    await insertRaw(Creatures, { _id: strangerId, name: 'Stranger', owner: otherUserId, readers: [], writers: [] });
    await insertRaw(CreatureProperties, {
      _id: Random.id(), type: 'attribute', attributeType: 'ability', variableName: 'dexterity', modifier: 4,
      root: { collection: 'creatures', id: rogueId }, left: 1, right: 2,
    });
    // The fighter has an initiative stat, the wizard only a Dexterity modifier
    await insertRaw(CreatureProperties, {
      _id: Random.id(), type: 'skill', variableName: 'initiative', value: 3,
      root: { collection: 'creatures', id: fighterId }, left: 1, right: 2,
    });
    await insertRaw(CreatureProperties, {
      _id: Random.id(), type: 'attribute', attributeType: 'ability', variableName: 'dexterity', modifier: -1,
      root: { collection: 'creatures', id: wizardId }, left: 1, right: 2,
    });
    await CreatureFolders.rawCollection().insertOne({
      _id: folderId, name: 'Party', owner: userId, creatures: [fighterId, wizardId], order: 0,
    });
  });

  after(async function () {
    if (!Meteor.isServer) return;
    await CreatureProperties.removeAsync({ 'root.id': { $in: [fighterId, wizardId, ...lateIds] } });
    await Creatures.removeAsync({ _id: { $in: [fighterId, wizardId, ...lateIds] } });
    await CreatureFolders.removeAsync(folderId);
    await Meteor.users.removeAsync(userId);
  });

  it('rolls d20 plus each character\'s bonus and starts round 1', async function () {
    await as(rollInitiative, {});
    const { round, turn, entries } = await tracker();
    assert.equal(round, 1);
    assert.equal(turn, 0);
    const fighter = entries.find(entry => entry.creatureId === fighterId);
    const wizard = entries.find(entry => entry.creatureId === wizardId);
    assert.equal(fighter.bonus, 3);
    assert.equal(wizard.bonus, -1);
    for (const entry of [fighter, wizard]) {
      assert.isAtLeast(entry.roll, 1);
      assert.isAtMost(entry.roll, 20);
      assert.equal(entry.initiative, entry.roll + entry.bonus);
    }
  });

  it('adds a creature by hand, with a given result, the turn staying put', async function () {
    const current = (await ordered())[(await tracker()).turn];
    await as(addInitiativeEntry, { name: 'Goblin', bonus: 2, initiative: 30 });
    const order = await ordered();
    assert.equal(order[0].name, 'Goblin');
    assert.equal(order.length, 3);
    assert.equal(order[(await tracker()).turn]._id, current._id);
  });

  it('advances turns and wraps into the next round', async function () {
    // From the first turn of round 1
    while ((await tracker()).turn > 0) await as(advanceInitiative, { step: -1 });
    await as(advanceInitiative, { step: 1 });
    await as(advanceInitiative, { step: 1 });
    assert.include(await tracker(), { round: 1, turn: 2 });
    await as(advanceInitiative, { step: 1 });
    assert.include(await tracker(), { round: 2, turn: 0 });
    await as(advanceInitiative, { step: -1 });
    assert.include(await tracker(), { round: 1, turn: 2 });
  });

  it('keeps the turn on the same creature when an earlier one is removed', async function () {
    const before = await ordered();
    const current = before[(await tracker()).turn];
    await as(removeInitiativeEntry, { entryId: before[0]._id });
    const after = await ordered();
    assert.equal(after[(await tracker()).turn]._id, current._id);
  });

  it('takes a typed result, the turn staying with the same creature', async function () {
    const [first] = await ordered();
    const current = (await ordered())[(await tracker()).turn];
    await as(updateInitiativeEntry, { entryId: first._id, initiative: 1 });
    const entry = (await tracker()).entries.find(e => e._id === first._id);
    assert.equal(entry.initiative, 1);
    assert.notExists(entry.roll);
    assert.equal((await ordered())[(await tracker()).turn]._id, current._id);
  });

  it('is only run by the folder\'s owner', async function () {
    /** @type {any} */
    let error;
    try {
      await as(advanceInitiative, { step: 1 }, otherUserId);
    } catch (e) {
      error = e;
    }
    assert.equal(error?.error, 'initiative.denied');
  });

  it('adds creatures numbered, their stats and status kept apart from the entries', async function () {
    await as(addInitiativeEntry, { name: 'Orc', bonus: 1, initiative: 12, count: 3, hp: 15, ac: 13 });
    const folder = /** @type {any} */ (await CreatureFolders.findOneAsync(folderId));
    const orcs = folder.initiative.entries.filter(entry => entry.name.startsWith('Orc'));
    assert.deepEqual(orcs.map(entry => entry.name), ['Orc 1', 'Orc 2', 'Orc 3']);
    for (const orc of orcs) {
      // The status tells of the hit points: the players see neither unless shown
      assert.notProperty(orc, 'status');
      assert.notProperty(orc, 'hp');
      assert.deepEqual(folder.initiativeStats[orc._id], { hp: 15, damage: 0, ac: 13 });
      assert.equal(entryStatus(folder.initiativeStats[orc._id], orc.out), 'unhurt');
    }
  });

  it('takes damage and healing, the status following', async function () {
    const orc = (await tracker()).entries.find(entry => entry.name === 'Orc 1');
    const status = async () => {
      const folder = /** @type {any} */ (await CreatureFolders.findOneAsync(folderId));
      const entry = folder.initiative.entries.find(entry => entry._id === orc._id);
      assert.notProperty(entry, 'status');
      return entryStatus(folder.initiativeStats[orc._id], entry.out);
    };
    await as(damageInitiativeEntry, { entryId: orc._id, amount: 6 });
    assert.equal(await status(), 'bloodied');
    await as(damageInitiativeEntry, { entryId: orc._id, amount: 20 });
    assert.equal(await status(), 'down');
    const stats = /** @type {any} */ (await CreatureFolders.findOneAsync(folderId)).initiativeStats;
    assert.equal(stats[orc._id].damage, 15);
    assert.equal(stats[orc._id].hp, 15);
    await as(damageInitiativeEntry, { entryId: orc._id, amount: -15 });
    assert.equal(await status(), 'unhurt');
  });

  it('skips the turn of a creature out of the fight', async function () {
    const orc = (await tracker()).entries.find(entry => entry.name === 'Orc 2');
    await as(setInitiativeEntryOut, { entryId: orc._id, out: true });
    const entry = (await tracker()).entries.find(entry => entry._id === orc._id);
    assert.isTrue(entry.out);
    assert.notProperty(entry, 'status');
    for (let i = 0; i < 8; i++) {
      await as(advanceInitiative, { step: 1 });
      assert.notEqual((await ordered())[(await tracker()).turn]._id, orc._id);
    }
  });

  it('lets only the game master hurt a creature', async function () {
    const orc = (await tracker()).entries.find(entry => entry.name === 'Orc 3');
    /** @type {any} */
    /** @type {any} */
    let error;
    try {
      await as(damageInitiativeEntry, { entryId: orc._id, amount: 3 }, otherUserId);
    } catch (e) {
      error = e;
    }
    assert.equal(error?.error, 'initiative.denied');
  });

  it('adds characters to a fight under way without rerolling anyone', async function () {
    await CreatureFolders.updateAsync(folderId, { $addToSet: { creatures: { $each: lateIds } } });
    const { entries: before, round } = await tracker();
    const current = (await ordered())[(await tracker()).turn];
    const added = await as(addCreaturesToInitiative, { creatureIds: [rogueId] });
    assert.lengthOf(added, 1);
    const after = await tracker();
    assert.equal(after.round, round, 'the fight goes on');
    for (const entry of before) {
      assert.deepInclude(after.entries, entry, `${entry.name} keeps its result`);
    }
    const rogue = after.entries.find(entry => entry.creatureId === rogueId);
    assert.include(rogue, { name: 'Rogue', bonus: 4 });
    assert.equal(rogue.initiative, rogue.roll + 4);
    assert.equal((await ordered())[after.turn]._id, current._id, 'the turn stays with the same creature');

    // Already in, not in the folder, or not the game master's to view: left out
    const again = await as(addCreaturesToInitiative, { creatureIds: [rogueId, strangerId, Random.id()] });
    assert.lengthOf(again, 0);
    assert.lengthOf((await tracker()).entries, before.length + 1);
  });

  it('rolls once for a group that shares its initiative', async function () {
    await as(addCreaturesToInitiative, { creatureIds: twinIds, sharedRoll: true });
    const twins = (await tracker()).entries.filter(entry => twinIds.includes(entry.creatureId));
    assert.deepEqual(twins.map(entry => entry.name), ['Twin 1', 'Twin 2']);
    assert.equal(twins[0].roll, twins[1].roll);
    assert.equal(twins[0].initiative, twins[1].initiative);
  });

  it('lets only the game master add characters to the fight', async function () {
    /** @type {any} */
    /** @type {any} */
    let error;
    try {
      await as(addCreaturesToInitiative, { creatureIds: [strangerId] }, otherUserId);
    } catch (e) {
      error = e;
    }
    assert.equal(error?.error, 'initiative.denied');
  });

  it('ends the combat', async function () {
    await as(endInitiative, {});
    assert.notExists(await tracker());
    assert.notExists(/** @type {any} */ (await CreatureFolders.findOneAsync(folderId)).initiativeStats);
  });
});

describe('The initiative tracker, changed between a method\'s read and its write', function () {
  const [userId, folderId, fighterId] = [Random.id(), Random.id(), Random.id()];
  const as = (method, args) => /** @type {any} */ (method)._execute({ userId }, { folderId, ...args });
  const tracker = async () => /** @type {any} */ (await CreatureFolders.findOneAsync(folderId)).initiative;
  const names = async () => initiativeOrder((await tracker()).entries).map(entry => entry.name);
  const whoseTurn = async () => (await names())[(await tracker()).turn];
  // A (20), B (15), C (10): round 1, B's turn
  const start = () => ({
    round: 1, turn: 1,
    entries: [['a', 'A', 20], ['b', 'B', 15], ['c', 'C', 10]].map(([_id, name, initiative]) => ({ _id, name, initiative, bonus: 0 })),
  });

  /**
   * Runs `work`, and `change` right after the folder's read number `reads`
   * (from 1): another change, landing between a method's read and its write.
   * Fails if it never landed
   */
  async function meanwhile(reads, change, work) {
    const folders = /** @type {any} */ (CreatureFolders);
    const original = folders.findOneAsync;
    let count = 0;
    let landed = false;
    folders.findOneAsync = async function (...args) {
      const result = await original.apply(this, args);
      count += 1;
      if (count === reads) {
        await change();
        landed = true;
      }
      return result;
    };
    try {
      await work();
    } finally {
      folders.findOneAsync = original;
    }
    assert.isTrue(landed, 'the other change landed meanwhile');
  }

  before(async function () {
    if (!Meteor.isServer) this.skip();
    await insertRaw(Creatures, { _id: fighterId, name: 'Fighter', owner: userId, readers: [], writers: [] });
  });

  beforeEach(async function () {
    if (!Meteor.isServer) this.skip();
    await CreatureFolders.removeAsync(folderId);
    await CreatureFolders.rawCollection().insertOne(/** @type {any} */ ({
      _id: folderId, name: 'Party', owner: userId, creatures: [fighterId], order: 0, initiative: start(),
    }));
  });

  after(async function () {
    if (!Meteor.isServer) return;
    await Creatures.removeAsync(fighterId);
    await CreatureFolders.removeAsync(folderId);
  });

  // Each change lands after the method's first read, then after its second:
  // the write must come from what the tracker is when it is written
  for (const reads of [1, 2]) {
    describe(`after read ${reads}`, function () {
      it('adds by hand: an entry removed meanwhile stays removed, the turn stays put', async function () {
        await meanwhile(reads, () => as(removeInitiativeEntry, { entryId: 'a' }),
          () => as(addInitiativeEntry, { name: 'Goblin', initiative: 1 }));
        assert.deepEqual(await names(), ['B', 'C', 'Goblin']);
        assert.equal(await whoseTurn(), 'B');
      });

      it('adds by hand: a turn passed meanwhile stays passed', async function () {
        await meanwhile(reads, () => as(advanceInitiative, { step: 1 }),
          () => as(addInitiativeEntry, { name: 'Goblin', initiative: 1 }));
        assert.deepEqual(await names(), ['A', 'B', 'C', 'Goblin']);
        assert.equal(await whoseTurn(), 'C');
      });

      it('adds a character: an entry removed meanwhile stays removed', async function () {
        await meanwhile(reads, () => as(removeInitiativeEntry, { entryId: 'a' }),
          () => as(addCreaturesToInitiative, { creatureIds: [fighterId] }));
        assert.sameMembers(await names(), ['B', 'C', 'Fighter']);
        assert.equal(await whoseTurn(), 'B');
      });

      it('rolls: an entry removed meanwhile does not come back', async function () {
        await meanwhile(reads, () => as(removeInitiativeEntry, { entryId: 'a' }), () => as(rollInitiative, {}));
        assert.sameMembers(await names(), ['B', 'C', 'Fighter']);
        assert.include(await tracker(), { round: 1, turn: 0 });
      });
    });
  }
});

describe('A full initiative tracker', function () {
  const [userId, folderId, firstId, secondId] = [Random.id(), Random.id(), Random.id(), Random.id()];
  const add = creatureIds => /** @type {any} */ (addCreaturesToInitiative)._execute({ userId }, { folderId, creatureIds });
  const entryCount = async () => /** @type {any} */ (await CreatureFolders.findOneAsync(folderId)).initiative.entries.length;

  before(async function () {
    if (!Meteor.isServer) this.skip();
    for (const _id of [firstId, secondId]) {
      await insertRaw(Creatures, { _id, name: 'Late', owner: userId, readers: [], writers: [] });
    }
    // One entry short of the tracker's limit
    const entries = Array.from({ length: MAX_INITIATIVE_ENTRIES - 1 }, (_, i) => ({
      _id: Random.id(), name: `Orc ${i + 1}`, initiative: 10, bonus: 0,
    }));
    await CreatureFolders.rawCollection().insertOne(/** @type {any} */ ({
      _id: folderId, name: 'Horde', owner: userId, creatures: [firstId, secondId], order: 0,
      initiative: { round: 1, turn: 0, entries },
    }));
  });

  after(async function () {
    if (!Meteor.isServer) return;
    await Creatures.removeAsync({ _id: { $in: [firstId, secondId] } });
    await CreatureFolders.removeAsync(folderId);
  });

  it('takes no more creatures than it holds, and says why', async function () {
    /** @type {any} */
    /** @type {any} */
    let error;
    try {
      await add([firstId, secondId]);
    } catch (e) {
      error = e;
    }
    assert.equal(error?.error, 'initiative.full');
    assert.deepEqual(error.details, { i18n: { key: 'initiative.full', params: { limit: MAX_INITIATIVE_ENTRIES } } });
    assert.equal(await entryCount(), MAX_INITIATIVE_ENTRIES - 1);
    await add([firstId]);
    assert.equal(await entryCount(), MAX_INITIATIVE_ENTRIES);
  });
});

describe('Creatures added to the initiative tracker', function () {
  it('tells their status from their hit points and the game master', function () {
    assert.isUndefined(entryStatus(undefined));
    assert.isUndefined(entryStatus({ ac: 12 }));
    assert.equal(entryStatus({ hp: 10, damage: 0 }), 'unhurt');
    assert.equal(entryStatus({ hp: 10, damage: 4 }), 'bloodied');
    assert.equal(entryStatus({ hp: 10, damage: 10 }), 'down');
    assert.equal(entryStatus({ ac: 12 }, true), 'down');
  });

  it('numbers creatures added together, after those already there', function () {
    assert.deepEqual(numberedNames(' Goblin ', 1), ['Goblin']);
    assert.deepEqual(numberedNames('Goblin', 3), ['Goblin 1', 'Goblin 2', 'Goblin 3']);
    assert.deepEqual(numberedNames('Goblin', 2, ['Goblin 1', 'Goblin 4', 'Goblin boss 9']), ['Goblin 5', 'Goblin 6']);
    assert.deepEqual(numberedNames('Orc (big)', 2, ['Orc (big) 1']), ['Orc (big) 2', 'Orc (big) 3']);
  });

  it('keeps damage between 0 and the hit points', function () {
    assert.equal(damageAfter({ hp: 10, damage: 8 }, 5), 10);
    assert.equal(damageAfter({ hp: 10, damage: 3 }, -5), 0);
    assert.equal(damageAfter({}, 4), 4);
  });

  it('publishes the stats to the game master only, unless shown', function () {
    assert.deepEqual(boardFolderFields('gm', {}), { 'discord.webhook': 0 }, 'never the webhook\'s URL, not even to the game master');
    assert.deepEqual(boardFolderFields('member', {}), { inviteToken: 0, initiativeStats: 0, discord: 0 });
    assert.deepEqual(boardFolderFields('member', { initiative: { showStats: true } }), { inviteToken: 0, discord: 0 });
  });
});
