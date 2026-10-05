import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import initiativeOrder, { turnAfterChange } from '/imports/api/creature/creatureFolders/initiativeOrder';
import {
  rollInitiative, addInitiativeEntry, updateInitiativeEntry, removeInitiativeEntry,
  advanceInitiative, endInitiative, damageInitiativeEntry, setInitiativeEntryOut,
} from '/imports/api/creature/creatureFolders/methods/initiativeMethods';
import {
  entryStatus, numberedNames, damageAfter, boardFolderFields,
} from '/imports/api/creature/creatureFolders/initiativeCreatures';

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

describe('Initiative tracker', function () {
  const [userId, otherUserId, folderId, fighterId, wizardId] =
    [Random.id(), Random.id(), Random.id(), Random.id(), Random.id()];
  const as = (method, args, user = userId) => method._execute({ userId: user }, { folderId, ...args });
  const tracker = async () => (await CreatureFolders.findOneAsync(folderId)).initiative;
  const ordered = async () => initiativeOrder((await tracker()).entries);

  before(async function () {
    if (!Meteor.isServer) this.skip();
    await Meteor.users.insertAsync({ _id: userId, username: `test-${userId}` });
    for (const [_id, name] of [[fighterId, 'Fighter'], [wizardId, 'Wizard']]) {
      await Creatures.rawCollection().insertOne({ _id, name, owner: userId, readers: [], writers: [] });
    }
    // The fighter has an initiative stat, the wizard only a Dexterity modifier
    await CreatureProperties.rawCollection().insertOne({
      _id: Random.id(), type: 'skill', variableName: 'initiative', value: 3,
      root: { collection: 'creatures', id: fighterId }, left: 1, right: 2,
    });
    await CreatureProperties.rawCollection().insertOne({
      _id: Random.id(), type: 'attribute', attributeType: 'ability', variableName: 'dexterity', modifier: -1,
      root: { collection: 'creatures', id: wizardId }, left: 1, right: 2,
    });
    await CreatureFolders.rawCollection().insertOne({
      _id: folderId, name: 'Party', owner: userId, creatures: [fighterId, wizardId], order: 0,
    });
  });

  after(async function () {
    if (!Meteor.isServer) return;
    await CreatureProperties.removeAsync({ 'root.id': { $in: [fighterId, wizardId] } });
    await Creatures.removeAsync({ _id: { $in: [fighterId, wizardId] } });
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
    let error;
    try {
      await as(advanceInitiative, { step: 1 }, otherUserId);
    } catch (e) {
      error = e;
    }
    assert.equal(error?.error, 'initiative.denied');
  });

  it('adds creatures numbered, their stats kept apart from the entries', async function () {
    await as(addInitiativeEntry, { name: 'Orc', bonus: 1, initiative: 12, count: 3, hp: 15, ac: 13 });
    const folder = /** @type {any} */ (await CreatureFolders.findOneAsync(folderId));
    const orcs = folder.initiative.entries.filter(entry => entry.name.startsWith('Orc'));
    assert.deepEqual(orcs.map(entry => entry.name), ['Orc 1', 'Orc 2', 'Orc 3']);
    for (const orc of orcs) {
      assert.equal(orc.status, 'unhurt');
      assert.notProperty(orc, 'hp');
      assert.deepEqual(folder.initiativeStats[orc._id], { hp: 15, damage: 0, ac: 13 });
    }
  });

  it('takes damage and healing, the status following', async function () {
    const orc = (await tracker()).entries.find(entry => entry.name === 'Orc 1');
    const status = async () => (await tracker()).entries.find(entry => entry._id === orc._id).status;
    await as(damageInitiativeEntry, { entryId: orc._id, amount: 6 });
    assert.equal(await status(), 'bloodied');
    await as(damageInitiativeEntry, { entryId: orc._id, amount: 20 });
    assert.equal(await status(), 'down');
    const stats = /** @type {any} */ (await CreatureFolders.findOneAsync(folderId)).initiativeStats;
    assert.equal(stats[orc._id].damage, 15);
    await as(damageInitiativeEntry, { entryId: orc._id, amount: -15 });
    assert.equal(await status(), 'unhurt');
  });

  it('skips the turn of a creature out of the fight', async function () {
    const orc = (await tracker()).entries.find(entry => entry.name === 'Orc 2');
    await as(setInitiativeEntryOut, { entryId: orc._id, out: true });
    assert.equal((await tracker()).entries.find(entry => entry._id === orc._id).status, 'down');
    for (let i = 0; i < 8; i++) {
      await as(advanceInitiative, { step: 1 });
      assert.notEqual((await ordered())[(await tracker()).turn]._id, orc._id);
    }
  });

  it('lets only the game master hurt a creature', async function () {
    const orc = (await tracker()).entries.find(entry => entry.name === 'Orc 3');
    /** @type {any} */
    let error;
    try {
      await as(damageInitiativeEntry, { entryId: orc._id, amount: 3 }, otherUserId);
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
    assert.deepEqual(boardFolderFields('gm', {}), {});
    assert.deepEqual(boardFolderFields('member', {}), { inviteToken: 0, initiativeStats: 0 });
    assert.deepEqual(boardFolderFields('member', { initiative: { showStats: true } }), { inviteToken: 0 });
  });
});
