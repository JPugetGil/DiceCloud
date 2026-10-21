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
  require('/imports/api/library/server/publications/library');
  require('/imports/api/library/server/publications/slotFillers');
  /* eslint-enable @typescript-eslint/no-require-imports */
}

/*
 * A library's pages (its tree, a node, its trash, a node's subtree): for those
 * who may view it, refused to the others with nothing of it sent; and the
 * slot dialog's search, by part of a name or a tag, read as text.
 */
if (Meteor.isServer) describe('Library pages and the fillers\' search', function () {
  this.timeout(60000);

  const [ownerId, strangerId] = [Random.id(), Random.id()];
  const [privateLibraryId, ownLibraryId] = [Random.id(), Random.id()];
  const [folderId, childId, trashedId, ownFillerId, otherFillerId] = [Random.id(), Random.id(), Random.id(), Random.id(), Random.id()];
  const [creatureId, slotId] = [Random.id(), Random.id()];
  const tag = `tag-${Random.id(6).toLowerCase()}`;

  const node = (_id: string, libraryId: string, extra = {}) => ({
    _id, type: 'folder', name: `Node ${_id}`, tags: [], root: { collection: 'libraries', id: libraryId }, left: 1, right: 2, ...extra,
  });
  const filler = (_id: string, name: string, libraryTags: string[], extra = {}) =>
    node(_id, ownLibraryId, { type: 'feature', name, fillSlots: true, libraryTags, ...extra });

  before(async function () {
    await Meteor.users.rawCollection().insertMany([
      { _id: ownerId, createdAt: new Date(), username: `pages-owner-${ownerId}` },
      { _id: strangerId, createdAt: new Date(), username: `pages-stranger-${strangerId}` },
    ] as any[]);
    await Libraries.rawCollection().insertMany([
      { _id: privateLibraryId, name: 'Private', owner: ownerId, readers: [], writers: [], public: false },
      { _id: ownLibraryId, name: 'Own', owner: strangerId, readers: [], writers: [], public: false },
    ] as any[]);
    await LibraryNodes.rawCollection().insertMany([
      node(folderId, privateLibraryId, { left: 1, right: 4 }),
      node(childId, privateLibraryId, { parentId: folderId, left: 2, right: 3 }),
      node(trashedId, privateLibraryId, { removed: true, removedAt: new Date(), left: 5, right: 6 }),
      filler(ownFillerId, 'Great Weapon Master', [tag, 'feat'], { left: 1, right: 2 }),
      filler(otherFillerId, 'Lucky', [tag, 'feat'], { left: 3, right: 4 }),
    ] as any[]);
    await Creatures.rawCollection().insertOne({
      _id: creatureId, name: 'Stranger\'s', owner: strangerId, type: 'pc', readers: [], writers: [], public: false,
    } as any);
    await CreatureProperties.rawCollection().insertOne({
      _id: slotId, type: 'propertySlot', name: 'Feat', slotTags: [tag], quantityExpected: { calculation: '1', value: 1 },
      root: { collection: 'creatures', id: creatureId }, left: 1, right: 2,
    } as any);
  });

  after(async function () {
    await CreatureProperties.removeAsync({ _id: slotId });
    await Creatures.removeAsync({ _id: creatureId });
    await LibraryNodes.removeAsync({ 'root.id': { $in: [privateLibraryId, ownLibraryId] } });
    await (Libraries as any).removeAsync({ _id: { $in: [privateLibraryId, ownLibraryId] } });
    await Meteor.users.removeAsync({ _id: { $in: [ownerId, strangerId] } });
  });

  const received = (messages: any[], collection: string, id: string) => about(messages, collection, id).length > 0;
  const pages: [string, string][] = [
    ['library', privateLibraryId],
    ['libraryNodes', privateLibraryId],
    ['softRemovedLibraryNodes', privateLibraryId],
    ['libraryNode', folderId],
    ['descendantLibraryNodes', folderId],
  ];

  it('refuses a library\'s pages to whoever may not view it, sending nothing of it', async function () {
    const stranger = await openAs(strangerId);
    try {
      for (const [name, id] of pages) {
        assert.exists(await refusal(stranger.subscribe(name, id)), name);
      }
      for (const [collection, id] of [
        ['libraries', privateLibraryId], ['libraryNodes', folderId], ['libraryNodes', childId], ['libraryNodes', trashedId],
      ]) {
        assert.isFalse(received(stranger.messages, collection, id), `${collection} ${id}`);
      }
    } finally {
      stranger.close();
    }
  });

  it('shows its owner the tree, a node\'s subtree, and the trash', async function () {
    const owner = await openAs(ownerId);
    try {
      await owner.subscribe('libraryNodes', privateLibraryId);
      assert.isTrue(received(owner.messages, 'libraryNodes', childId), 'the tree');
      await owner.subscribe('descendantLibraryNodes', folderId);
      await owner.subscribe('softRemovedLibraryNodes', privateLibraryId);
      assert.isTrue(received(owner.messages, 'libraryNodes', trashedId), 'the trash');
    } finally {
      owner.close();
    }
  });

  it('searches a slot\'s fillers by part of a name or by a tag, reading the search as text', async function () {
    for (const [search, expected] of [
      ['weapon', [ownFillerId]],
      ['feat', [ownFillerId, otherFillerId]],
      ['Gr.at', []],
      ['nothing like it', []],
    ] as const) {
      const stranger = await openAs(strangerId);
      try {
        await stranger.subscribe('slotFillers', slotId, search, false);
        const found = [ownFillerId, otherFillerId].filter(id => received(stranger.messages, 'libraryNodes', id));
        assert.deepEqual(found, [...expected], search);
      } finally {
        stranger.close();
      }
    }
  });
});
