import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import initiativeOrder from '/imports/api/creature/creatureFolders/initiativeOrder';
import {
  rollInitiative, addInitiativeEntry, updateInitiativeEntry, removeInitiativeEntry,
  advanceInitiative, endInitiative,
} from '/imports/api/creature/creatureFolders/methods/initiativeMethods';

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

  it('adds a creature by hand, with a given result', async function () {
    await as(addInitiativeEntry, { name: 'Goblin', bonus: 2, initiative: 30 });
    const order = await ordered();
    assert.equal(order[0].name, 'Goblin');
    assert.equal(order.length, 3);
  });

  it('advances turns and wraps into the next round', async function () {
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

  it('takes a typed result', async function () {
    const [first] = await ordered();
    await as(updateInitiativeEntry, { entryId: first._id, initiative: 1 });
    const entry = (await tracker()).entries.find(e => e._id === first._id);
    assert.equal(entry.initiative, 1);
    assert.notExists(entry.roll);
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

  it('ends the combat', async function () {
    await as(endInitiative, {});
    assert.notExists(await tracker());
  });
});
