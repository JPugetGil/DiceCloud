import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import Libraries from '/imports/api/library/Libraries';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import { about, openAs, refusal } from '/imports/api/utility/ddpClient.testFn';

if (Meteor.isServer) {
  // Unit tests load no entry point: the publications register here
  /* eslint-disable @typescript-eslint/no-require-imports */
  require('/imports/api/library/server/publications/slotFillers');
  require('/imports/api/library/server/publications/searchLibraryNodes');
  /* eslint-enable @typescript-eslint/no-require-imports */
}

/*
 * The library publications that a slot's dialog and the property dialog
 * subscribe to with ids the client chooses: a node of a library the user may
 * not view never reaches them, nor anything of a slot they may not view.
 * selectedFillers sent any node by its id; slotFillers and selectedFillers
 * read anyone's slot; selectedLibraryNodes checked the library a node's
 * `ancestors` named, a field of database version 2.
 */
if (Meteor.isServer) describe('Library nodes reach only those who may view their library', function () {
  this.timeout(60000);

  const [ownerId, strangerId] = [Random.id(), Random.id()];
  const [privateLibraryId, ownLibraryId, publicLibraryId] = [Random.id(), Random.id(), Random.id()];
  const [secretNodeId, ownNodeId, movedNodeId, movedChildId] = [Random.id(), Random.id(), Random.id(), Random.id()];
  const [ownerCreatureId, ownerSlotId, strangerCreatureId, strangerSlotId] =
    [Random.id(), Random.id(), Random.id(), Random.id()];
  // The owner's slot's own tag, which no filter sent to the stranger may hold
  const SLOT_TAG = `secret-slot-tag-${Random.id()}`;

  const library = (_id: string, owner: string, extra = {}) => ({
    _id, name: `Library ${_id}`, owner, readers: [], writers: [], public: false, ...extra,
  });
  const filler = (_id: string, libraryId: string, extra = {}) => ({
    _id, type: 'feature', name: `Filler ${_id}`, fillSlots: true, searchable: true, libraryTags: ['feat'],
    root: { collection: 'libraries', id: libraryId }, left: 1, right: 2, ...extra,
  });
  const slot = (_id: string, creatureId: string, slotTags: string[]) => ({
    _id, type: 'propertySlot', name: 'Feat', slotTags, quantityExpected: { calculation: '1', value: 1 },
    root: { collection: 'creatures', id: creatureId }, left: 1, right: 2,
  });

  before(async function () {
    await Meteor.users.rawCollection().insertMany([
      { _id: ownerId, createdAt: new Date(), username: `library-owner-${ownerId}` },
      { _id: strangerId, createdAt: new Date(), username: `library-stranger-${strangerId}` },
    ] as any[]);
    await Libraries.rawCollection().insertMany([
      library(privateLibraryId, ownerId),
      library(ownLibraryId, strangerId),
      library(publicLibraryId, ownerId, { public: true }),
    ] as any[]);
    await LibraryNodes.rawCollection().insertMany([
      filler(secretNodeId, privateLibraryId),
      // Made in the app: no `ancestors`
      filler(ownNodeId, ownLibraryId),
      // Moved from the public library into the private one: its `ancestors`
      // still name the public one
      filler(movedNodeId, privateLibraryId, {
        left: 3, right: 6, ancestors: [{ collection: 'libraries', id: publicLibraryId }],
      }),
      filler(movedChildId, privateLibraryId, { left: 4, right: 5, parentId: movedNodeId, fillSlots: false }),
    ] as any[]);
    await Creatures.rawCollection().insertMany([
      { _id: ownerCreatureId, name: 'Owner\'s', owner: ownerId, type: 'pc', readers: [], writers: [], public: false },
      { _id: strangerCreatureId, name: 'Stranger\'s', owner: strangerId, type: 'pc', readers: [], writers: [], public: false },
    ] as any[]);
    await CreatureProperties.rawCollection().insertMany([
      slot(ownerSlotId, ownerCreatureId, ['feat', SLOT_TAG]),
      slot(strangerSlotId, strangerCreatureId, ['feat']),
    ] as any[]);
  });

  after(async function () {
    await CreatureProperties.removeAsync({ _id: { $in: [ownerSlotId, strangerSlotId] } });
    await Creatures.removeAsync({ _id: { $in: [ownerCreatureId, strangerCreatureId] } });
    await LibraryNodes.removeAsync({ _id: { $in: [secretNodeId, ownNodeId, movedNodeId, movedChildId] } });
    await (Libraries as any).removeAsync({ _id: { $in: [privateLibraryId, ownLibraryId, publicLibraryId] } });
    await Meteor.users.removeAsync({ _id: { $in: [ownerId, strangerId] } });
  });

  const received = (messages: any[], id: string) => about(messages, 'libraryNodes', id).length > 0;

  it('selectedFillers: never a node of a private library, whatever ids the client names', async function () {
    const stranger = await openAs(strangerId);
    try {
      await stranger.subscribe('selectedFillers', strangerSlotId, [ownNodeId, secretNodeId, movedNodeId], false);
      assert.isTrue(received(stranger.messages, ownNodeId), 'a node of the user\'s own library');
      assert.isFalse(received(stranger.messages, secretNodeId), 'not one of a private library');
      assert.isFalse(received(stranger.messages, movedNodeId));
      // A bounded list of ids
      const tooMany = Array.from({ length: 101 }, () => Random.id());
      assert.exists(await refusal(stranger.subscribe('selectedFillers', strangerSlotId, tooMany, false)), '101 ids');
    } finally {
      stranger.close();
    }
  });

  it('selectedFillers and slotFillers: nothing for a slot of a creature the user may not view', async function () {
    const stranger = await openAs(strangerId);
    try {
      await stranger.subscribe('selectedFillers', ownerSlotId, [ownNodeId], false);
      await stranger.subscribe('slotFillers', ownerSlotId, undefined, false);
      assert.isFalse(received(stranger.messages, ownNodeId), 'no filler for another\'s slot');
      assert.notInclude(JSON.stringify(stranger.messages), SLOT_TAG, 'nothing of the slot, its tags included');
      // A dialog opened without a slot gets nothing, without an error: what
      // SlotFillDialog sends then (the e2e `dialogs` check opens it so, and a
      // library's slot tried out before it is saved has no id). An id that is
      // no string is refused
      await stranger.subscribe('slotFillers', undefined, undefined, false);
      await stranger.subscribe('selectedFillers', undefined, [], false);
      await stranger.subscribe('selectedFillers', undefined, [ownNodeId], false);
      assert.isFalse(received(stranger.messages, ownNodeId));
      assert.exists(await refusal(stranger.subscribe('slotFillers', { $ne: null }, undefined, false)));
      // Their own slot still gets its fillers, with the filter
      await stranger.subscribe('slotFillers', strangerSlotId, undefined, false);
      assert.isTrue(received(stranger.messages, ownNodeId));
    } finally {
      stranger.close();
    }
  });

  it('selectedLibraryNodes: by the library a node is in now, with or without `ancestors`', async function () {
    const stranger = await openAs(strangerId);
    try {
      const error = await refusal(stranger.subscribe('selectedLibraryNodes', [movedNodeId]));
      assert.isFalse(received(stranger.messages, movedNodeId), 'not a node moved into a private library');
      assert.isFalse(received(stranger.messages, movedChildId), 'nor anything under it');
      assert.exists(error, 'refused');
      await stranger.subscribe('selectedLibraryNodes', [ownNodeId]);
      assert.isTrue(received(stranger.messages, ownNodeId), 'a node made in the app, without `ancestors`');
    } finally {
      stranger.close();
    }
  });
});
