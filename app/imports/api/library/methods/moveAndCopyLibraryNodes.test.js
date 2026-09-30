import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Libraries from '/imports/api/library/Libraries';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import copyLibraryNodeTo from '/imports/api/library/methods/copyLibraryNodeTo';
import { moveBetweenRoots, moveWithinRoot } from '/imports/api/parenting/organizeMethods';

// What the library node dialog's move and copy do: the chosen node becomes the
// new parent, the moved or copied node its last child
const userId = Random.id();
const [libraryA, libraryB] = [Random.id(), Random.id()];
const ids = {
  folderA: Random.id(), childA: Random.id(), nodeA: Random.id(), folderB: Random.id(),
};

const node = (_id, library, left, right, parentId) => ({
  _id, type: 'folder', name: _id, tags: [], left, right,
  root: { collection: 'libraries', id: library },
  ...parentId && { parentId },
});

const get = _id => LibraryNodes.findOneAsync(_id);
const asUser = { userId };

describe('Move and copy library nodes', function () {
  before(async function () {
    if (!Meteor.isServer) this.skip();
    await Meteor.users.insertAsync({ _id: userId, username: `test-${userId}` });
    for (const _id of [libraryA, libraryB]) {
      await Libraries.rawCollection().insertOne({ _id, name: _id, owner: userId });
    }
    for (const doc of [
      node(ids.folderA, libraryA, 1, 4),
      node(ids.childA, libraryA, 2, 3, ids.folderA),
      node(ids.nodeA, libraryA, 5, 6),
      node(ids.folderB, libraryB, 1, 2),
    ]) {
      await LibraryNodes.rawCollection().insertOne(doc);
    }
  });

  after(async function () {
    if (!Meteor.isServer) return;
    await LibraryNodes.removeAsync({ 'root.id': { $in: [libraryA, libraryB] } });
    await Libraries.removeAsync({ _id: { $in: [libraryA, libraryB] } });
    await Meteor.users.removeAsync(userId);
  });

  it('Moves a node into a parent of the same library, after its children', async function () {
    const folderA = await get(ids.folderA);
    await moveWithinRoot._execute(asUser, {
      docRef: { collection: 'libraryNodes', id: ids.nodeA },
      newPosition: folderA.right - 0.5,
    });
    const [moved, child] = [await get(ids.nodeA), await get(ids.childA)];
    assert.equal(moved.parentId, ids.folderA);
    assert.isAbove(moved.left, child.left);
  });

  it('Moves a node into a parent of another library', async function () {
    const folderB = await get(ids.folderB);
    await moveBetweenRoots._execute(asUser, {
      docRef: { collection: 'libraryNodes', id: ids.nodeA },
      newPosition: folderB.right - 0.5,
      newRootRef: folderB.root,
    });
    const moved = await get(ids.nodeA);
    assert.equal(moved.root.id, libraryB);
    assert.equal(moved.parentId, ids.folderB);
  });

  it('Copies a node into a parent of another library', async function () {
    await copyLibraryNodeTo._execute(asUser, {
      _id: ids.childA,
      parent: { collection: 'libraryNodes', id: ids.folderB },
    });
    const copy = await LibraryNodes.findOneAsync({ name: ids.childA, _id: { $ne: ids.childA } });
    assert.exists(copy);
    assert.equal(copy.root.id, libraryB);
    assert.equal(copy.parentId, ids.folderB);
    // The original stays where it was
    assert.equal((await get(ids.childA)).root.id, libraryA);
  });

  it('Copies a node to the top of a library', async function () {
    await copyLibraryNodeTo._execute(asUser, {
      _id: ids.folderB,
      parent: { collection: 'libraries', id: libraryA },
    });
    const copy = await LibraryNodes.findOneAsync({ name: ids.folderB, _id: { $ne: ids.folderB } });
    assert.exists(copy);
    assert.equal(copy.root.id, libraryA);
    assert.notExists(copy.parentId);
  });
});
