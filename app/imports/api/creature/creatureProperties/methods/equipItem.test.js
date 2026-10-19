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

// A property the test inserted: the test fails here when it is missing
const get = async _id => {
  const doc = await CreatureProperties.findOneAsync(_id);
  assert.exists(doc, `property ${_id}`);
  return doc;
};

const equip = equipped => /** @type {any} */ (equipItem)._execute({ userId }, { _id: itemId, equipped });

describe('Equip item', function () {
  before(async function () {
    if (!Meteor.isServer) this.skip();
    await Meteor.users.insertAsync({ _id: userId, username: `test-${userId}` });
    // A partial creature, past the schema: what the method reads of it
    await Creatures.rawCollection().insertOne(/** @type {any} */ ({ _id: creatureId, name: 'Test', owner: userId }));
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
    const item = await get(itemId);
    assert.isTrue(item.equipped);
    assert.equal(item.parentId, equipmentFolderId);
  });

  it('Moves an unequipped item to the end of the tree without a carried folder', async function () {
    await equip(false);
    const [item, last] = [await get(itemId), await get(lastPropId)];
    assert.isFalse(item.equipped);
    assert.notExists(item.parentId);
    assert.isAbove(item.left, last.left);
  });
});
