import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Libraries from '/imports/api/library/Libraries';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import LibraryCollections from '/imports/api/library/LibraryCollections';
import {
  prepareImportedNodes, exportLibrary, exportLibraryCollection, importLibrary, importLibraryCollection,
} from '/imports/api/library/methods/libraryFiles';

describe('Library files', function () {
  describe('prepareImportedNodes', function () {
    const libraryId = 'library1';
    const root = { collection: 'libraries', id: libraryId };

    it('migrates database version 2 nodes, and keeps version 3 ones', function () {
      const nodes = prepareImportedNodes([
        {
          _id: 'folder', type: 'folder', order: 1,
          ancestors: [root], parent: root,
        },
        {
          _id: 'spell', type: 'spell', order: 2,
          ancestors: [root, { collection: 'libraryNodes', id: 'folder' }],
          parent: { collection: 'libraryNodes', id: 'folder' },
        },
        { _id: 'item', type: 'item', root, parentId: 'folder', left: 5, right: 6 },
      ], libraryId);
      assert.deepEqual(nodes[0], { _id: 'folder', type: 'folder', root, left: 1, right: 1 });
      assert.deepEqual(nodes[1], { _id: 'spell', type: 'spell', root, parentId: 'folder', left: 2, right: 2 });
      assert.deepEqual(nodes[2], { _id: 'item', type: 'item', root, parentId: 'folder', left: 5, right: 6 });
    });

    it('leaves the removed nodes out', function () {
      const nodes = prepareImportedNodes([
        { _id: 'a', type: 'note', root, removed: true, removedAt: new Date() },
        { _id: 'b', type: 'note', root },
      ], libraryId);
      assert.deepEqual(nodes.map(node => node._id), ['b']);
    });

    it('refuses nodes of another library, without an id or type, or twice', function () {
      const other = { collection: 'libraries', id: 'library2' };
      for (const [nodes, reason] of [
        [[{ _id: 'a', type: 'note', root: other }], 'another library'],
        [[{ _id: 'a', type: 'note', ancestors: [other] }], 'another library, version 2'],
        [[{ type: 'note', root }], 'no id'],
        [[{ _id: 'a', root }], 'no type'],
        [[{ _id: 'a', type: 'note', root }, { _id: 'a', type: 'note', root }], 'twice'],
      ] as [any[], string][]) {
        assert.throws(() => prepareImportedNodes(nodes, libraryId), Meteor.Error, undefined, reason);
      }
    });
  });

  describe('methods', function () {
    const [adminId, playerId] = [Random.id(), Random.id()];
    const libraryId = Random.id();
    const collectionId = Random.id();
    const [folderId, noteId, otherLibraryNodeId] = [Random.id(), Random.id(), Random.id()];
    const otherLibraryId = Random.id();
    const as = (method, userId: string, args: object) => method._execute({ userId }, args);
    const root = { collection: 'libraries', id: libraryId };
    const fileNodes = () => [
      { _id: folderId, type: 'folder', name: 'Spells', root, left: 1, right: 4 },
      { _id: noteId, type: 'note', name: 'Fireball', root, parentId: folderId, left: 2, right: 3 },
    ];

    async function assertRefused(promise: Promise<unknown>, message: string) {
      let error;
      try {
        await promise;
      } catch (e) {
        error = e;
      }
      assert.exists(error, message);
    }

    async function removeAll() {
      await Libraries.removeAsync(libraryId);
      await Libraries.removeAsync(otherLibraryId);
      await LibraryNodes.rawCollection().deleteMany({ 'root.id': { $in: [libraryId, otherLibraryId] } });
      await LibraryCollections.removeAsync(collectionId);
      await Meteor.users.removeAsync({ _id: { $in: [adminId, playerId] } });
    }

    beforeEach(async function () {
      if (!Meteor.isServer) this.skip();
      await removeAll();
      await Meteor.users.rawCollection().insertMany([
        { _id: adminId, createdAt: new Date(), roles: ['admin'] },
        { _id: playerId, createdAt: new Date() },
      ] as any[]);
    });

    after(async function () {
      if (!Meteor.isServer) return;
      await removeAll();
    });

    it('imports a library for the admin, then skips it, or replaces its nodes', async function () {
      const library = { _id: libraryId, name: 'Spells of the North', description: 'Cold' };
      await assertRefused(as(importLibrary, playerId, { library, nodes: fileNodes() }), 'players can\'t import');

      assert.deepEqual(await as(importLibrary, adminId, { library, nodes: fileNodes() }),
        { status: 'imported', nodes: 2 });
      const imported = await Libraries.findOneAsync(libraryId);
      assert.equal(imported?.owner, adminId);
      assert.isFalse(imported?.public);
      const nodes = await LibraryNodes.find({ 'root.id': libraryId }, { sort: { left: 1 } }).fetchAsync();
      assert.deepEqual(nodes.map(node => [node.name, node.left, node.right]), [['Spells', 1, 4], ['Fireball', 2, 3]]);

      assert.deepEqual(await as(importLibrary, adminId, { library, nodes: fileNodes() }),
        { status: 'skipped', nodes: 0 }, 'already here');

      // Shared with a player: replacing keeps that, and takes the file's nodes and name
      await Libraries.updateAsync(libraryId, { $set: { readers: [playerId] } });
      const replacement = [{ ...fileNodes()[1], name: 'Cone of cold', parentId: undefined, left: 1, right: 2 }];
      assert.deepEqual(await as(importLibrary, adminId, {
        library: { _id: libraryId, name: 'Spells of the South' }, nodes: replacement, replace: true,
      }), { status: 'replaced', nodes: 1 });
      const replaced = await Libraries.findOneAsync(libraryId);
      assert.equal(replaced?.name, 'Spells of the South');
      assert.isUndefined(replaced?.description);
      assert.deepEqual(replaced?.readers, [playerId]);
      assert.deepEqual((await LibraryNodes.find({ 'root.id': libraryId }).fetchAsync()).map(node => node.name),
        ['Cone of cold']);
    });

    it('imports nothing when a node clashes with another library\'s, and leaves that one', async function () {
      await LibraryNodes.rawCollection().insertOne({
        _id: otherLibraryNodeId, type: 'note', name: 'Theirs',
        root: { collection: 'libraries', id: otherLibraryId }, left: 1, right: 2,
      } as any);
      const nodes = [...fileNodes(), { _id: otherLibraryNodeId, type: 'note', root, left: 5, right: 6 }];
      await assertRefused(as(importLibrary, adminId, { library: { _id: libraryId, name: 'Clash' }, nodes }),
        'a duplicate node id');
      assert.notExists(await Libraries.findOneAsync(libraryId));
      assert.equal(await LibraryNodes.find({ 'root.id': libraryId }).countAsync(), 0);
      assert.equal((await LibraryNodes.findOneAsync(otherLibraryNodeId))?.name, 'Theirs');
    });

    it('exports a library to whoever can copy it', async function () {
      await as(importLibrary, adminId, { library: { _id: libraryId, name: 'Shared' }, nodes: fileNodes() });
      const file = await as(exportLibrary, adminId, { libraryId });
      assert.equal(file.library.name, 'Shared');
      assert.lengthOf(file.nodes, 2);

      await Libraries.updateAsync(libraryId, { $set: { public: true } });
      await assertRefused(as(exportLibrary, playerId, { libraryId }), 'public, but not to copy');
      await Libraries.updateAsync(libraryId, { $set: { readersCanCopy: true } });
      assert.lengthOf((await as(exportLibrary, playerId, { libraryId })).nodes, 2);
    });

    it('imports a collection of the libraries that are here, and exports it', async function () {
      await as(importLibrary, adminId, { library: { _id: libraryId, name: 'Member' }, nodes: fileNodes() });
      const collection = { _id: collectionId, name: 'Everything', libraries: [otherLibraryId, libraryId] };
      assert.deepEqual(await as(importLibraryCollection, adminId, { collection, makePublic: true }),
        { status: 'imported' });
      const imported = await LibraryCollections.findOneAsync(collectionId);
      assert.deepEqual(imported?.libraries, [libraryId], 'the libraries that are here');
      assert.isTrue(imported?.public);
      assert.deepEqual(await as(importLibraryCollection, adminId, { collection }), { status: 'skipped' });
      await assertRefused(as(importLibraryCollection, playerId, { collection, replace: true }), 'admins only');

      const file = await as(exportLibraryCollection, playerId, { libraryCollectionId: collectionId });
      assert.deepEqual(file, { _id: collectionId, name: 'Everything', description: undefined, libraries: [libraryId] });
    });
  });
});
