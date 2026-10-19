import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { alreadyAddedSelector, isAlreadyAdded } from '/imports/ui/creature/slots/alreadyAddedFillers';

/*
 * A slot that takes each filler once (uniqueInSlot, the default) disables
 * the fillers it already holds a copy of; uniqueInCreature, those the
 * creature holds anywhere. Run against the properties as the sheet has them.
 */
describe('The fillers a slot already holds (alreadyAddedFillers)', function () {
  const creatureId = Random.id();
  const [featSlotId, otherSlotId, alertCopyId, luckyCopyId, toughCopyId] =
    [Random.id(), Random.id(), Random.id(), Random.id(), Random.id()];
  const [alertNodeId, luckyNodeId, toughNodeId] = [Random.id(), Random.id(), Random.id()];
  const root = { collection: 'creatures', id: creatureId };

  before(async function () {
    if (!Meteor.isServer) this.skip();
    // Partial documents, inserted raw: only the fields the selectors read
    await CreatureProperties.rawCollection().insertMany(/** @type {any[]} */ ([
      { _id: featSlotId, type: 'propertySlot', name: 'Feat', unique: 'uniqueInSlot', root, left: 1, right: 6 },
      // Alert in this slot, and Tough removed from it
      { _id: alertCopyId, type: 'feature', name: 'Alert', libraryNodeId: alertNodeId, parentId: featSlotId, root, left: 2, right: 3 },
      {
        _id: toughCopyId, type: 'feature', name: 'Tough', libraryNodeId: toughNodeId, parentId: featSlotId,
        removed: true, root, left: 4, right: 5,
      },
      // Lucky in another slot of the creature
      { _id: otherSlotId, type: 'propertySlot', name: 'Bonus feat', root, left: 7, right: 10 },
      { _id: luckyCopyId, type: 'feature', name: 'Lucky', libraryNodeId: luckyNodeId, parentId: otherSlotId, root, left: 8, right: 9 },
    ]));
  });

  after(async function () {
    if (!Meteor.isServer) return;
    await CreatureProperties.removeAsync({ 'root.id': creatureId });
  });

  const added = async (slot) => {
    const selector = alreadyAddedSelector(slot, creatureId);
    if (!selector) return [];
    return (await CreatureProperties.find(selector).fetchAsync()).map(prop => prop.libraryNodeId);
  };

  it('uniqueInSlot: the fillers under the slot, not those elsewhere nor removed', async function () {
    assert.deepEqual(await added({ _id: featSlotId, unique: 'uniqueInSlot' }), [alertNodeId]);
  });

  it('uniqueInCreature: the fillers anywhere on the creature', async function () {
    assert.sameMembers(await added({ _id: featSlotId, unique: 'uniqueInCreature' }), [alertNodeId, luckyNodeId]);
  });

  it('none when the slot takes a filler again, or without a creature', async function () {
    assert.isUndefined(alreadyAddedSelector({ _id: featSlotId }, creatureId));
    assert.isUndefined(alreadyAddedSelector({ _id: featSlotId, unique: 'uniqueInSlot' }, undefined));
  });

  it('a reference counts as the node it names, whose copy the slot holds', function () {
    const addedIds = new Set([alertNodeId]);
    assert.isTrue(isAlreadyAdded({ _id: alertNodeId }, addedIds));
    // As stored: the cache keeps the node's name, type, level and value, not its id
    const reference = { _id: Random.id(), type: 'reference', ref: { id: alertNodeId, collection: 'libraryNodes' } };
    const cached = { ...reference, cache: { node: { name: 'Alert', type: 'feature' } } };
    assert.isTrue(isAlreadyAdded(cached, addedIds));
    const toAnother = { ...reference, ref: { id: luckyNodeId, collection: 'libraryNodes' } };
    assert.isFalse(isAlreadyAdded(toAnother, addedIds));
    assert.isFalse(isAlreadyAdded({ _id: luckyNodeId }, addedIds));
  });
});
