import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import equipItem from '/imports/api/creature/creatureProperties/methods/equipItem';

// Equipping moves the item into the first folder tagged `equipment`,
// unequipping into the one tagged `carried`, or to the end of the tree
const [userId, creatureId, equipmentFolderId, itemId, lastPropId] =
  [Random.id(), Random.id(), Random.id(), Random.id(), Random.id()];

const prop = (_id, left, right, fields) => ({
  _id, left, right, tags: [],
  root: { collection: 'creatures', id: creatureId },
  ...fields,
});

const equip = equipped => equipItem._execute({ userId }, { _id: itemId, equipped });

describe('Equip item', function () {
  before(async function () {
    if (!Meteor.isServer) this.skip();
    await Meteor.users.insertAsync({ _id: userId, username: `test-${userId}` });
    await Creatures.rawCollection().insertOne({ _id: creatureId, name: 'Test', owner: userId });
    for (const doc of [
      prop(equipmentFolderId, 1, 2, { type: 'folder', name: 'Equipment', tags: ['equipment'] }),
      prop(itemId, 3, 4, { type: 'item', name: 'Sword', quantity: 1 }),
      prop(lastPropId, 5, 6, { type: 'note', name: 'Last' }),
    ]) {
      await CreatureProperties.rawCollection().insertOne(doc);
    }
  });

  after(async function () {
    if (!Meteor.isServer) return;
    await CreatureProperties.removeAsync({ 'root.id': creatureId });
    await Creatures.removeAsync(creatureId);
    await Meteor.users.removeAsync(userId);
  });

  it('Moves an equipped item into the equipment folder', async function () {
    await equip(true);
    const item = await CreatureProperties.findOneAsync(itemId);
    assert.isTrue(item.equipped);
    assert.equal(item.parentId, equipmentFolderId);
  });

  it('Moves an unequipped item to the end of the tree without a carried folder', async function () {
    await equip(false);
    const [item, last] = [
      await CreatureProperties.findOneAsync(itemId),
      await CreatureProperties.findOneAsync(lastPropId),
    ];
    assert.isFalse(item.equipped);
    assert.notExists(item.parentId);
    assert.isAbove(item.left, last.left);
  });
});
