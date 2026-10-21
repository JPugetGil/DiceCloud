import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Libraries from '/imports/api/library/Libraries';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import updateReferenceNode from '/imports/api/library/methods/updateReferenceNode';

// A reference node keeps a copy of the node it points to (its cache), for the
// library to show: only of a node its editor may read
const [userId, otherUserId] = [Random.id(), Random.id()];
const [library, readable, privateLibrary] = [Random.id(), Random.id(), Random.id()];
const [referenceId, sameLibraryNode, removedNode, readableNode, privateNode] =
  [Random.id(), Random.id(), Random.id(), Random.id(), Random.id()];
const libraries = [library, readable, privateLibrary];

const node = (_id, libraryId, fields) => ({
  _id, type: 'folder', tags: [], left: 1, right: 2, root: { collection: 'libraries', id: libraryId }, ...fields,
});
/** Points the reference at `ref`, refreshes it as `user`, and returns its cache */
async function refresh(ref, user = userId) {
  await LibraryNodes.rawCollection().updateOne({ _id: referenceId }, ref ? { $set: { ref } } : { $unset: { ref: 1 } });
  await /** @type {any} */ (updateReferenceNode)._execute({ userId: user }, { _id: referenceId });
  return (await LibraryNodes.findOneAsync(referenceId))?.cache;
}

describe('Update a reference node', function () {
  before(async function () {
    if (!Meteor.isServer) this.skip();
    await Meteor.users.insertAsync({ _id: userId, username: `test-${userId}` });
    await Meteor.users.insertAsync({ _id: otherUserId, username: `test-${otherUserId}` });
    await Libraries.rawCollection().insertOne({ _id: library, name: 'Mine', owner: userId });
    await Libraries.rawCollection().insertOne({ _id: readable, name: 'Readable', owner: otherUserId, readers: [userId] });
    await Libraries.rawCollection().insertOne({ _id: privateLibrary, name: 'Private', owner: otherUserId });
    for (const doc of [
      node(referenceId, library, { type: 'reference', cache: {}, left: 1, right: 2 }),
      node(sameLibraryNode, library, { name: 'Next door', left: 3, right: 4 }),
      node(removedNode, library, { name: 'Gone', removed: true, left: 5, right: 6 }),
      node(readableNode, readable, { name: 'Shared' }),
      node(privateNode, privateLibrary, { name: 'Secret' }),
    ]) {
      await LibraryNodes.rawCollection().insertOne(doc);
    }
  });

  after(async function () {
    if (!Meteor.isServer) return;
    await LibraryNodes.removeAsync({ 'root.id': { $in: libraries } });
    await Libraries.removeAsync({ _id: { $in: libraries } });
    await Meteor.users.removeAsync({ _id: { $in: [userId, otherUserId] } });
  });

  it('copies a node of its own library', async function () {
    const cache = await refresh({ collection: 'libraryNodes', id: sameLibraryNode });
    assert.equal(cache?.node?.name, 'Next door');
    assert.notExists(cache?.library);
    assert.notExists(cache?.error);
  });

  it('copies a node of a library its editor reads, naming the library', async function () {
    const cache = await refresh({ collection: 'libraryNodes', id: readableNode });
    assert.equal(cache?.node?.name, 'Shared');
    assert.deepEqual(cache?.library, { id: readable, name: 'Readable' });
  });

  it('keeps nothing of a library its editor cannot read, but the error', async function () {
    const cache = await refresh({ collection: 'libraryNodes', id: privateNode });
    assert.notExists(cache?.node);
    assert.match(cache?.error ?? '', /permission/i);
  });

  it('keeps nothing of a deleted node, nor of what is not a library node', async function () {
    assert.equal((await refresh({ collection: 'libraryNodes', id: removedNode }))?.error, 'Property has been deleted');
    // A user has no root: never cached
    const user = await refresh({ collection: 'users', id: otherUserId });
    assert.notExists(user?.node);
    assert.exists(user?.error);
  });

  it('empties the cache of a reference pointing nowhere', async function () {
    await refresh({ collection: 'libraryNodes', id: sameLibraryNode });
    assert.deepEqual(await refresh(undefined), {});
  });

  it('is for the reference\'s editors only', async function () {
    await refresh({ collection: 'libraryNodes', id: sameLibraryNode });
    let error;
    try {
      await refresh({ collection: 'libraryNodes', id: readableNode }, otherUserId);
    } catch (e) {
      error = e;
    }
    assert.match(/** @type {any} */ (error)?.error ?? '', /permission/i);
    // Untouched by the refused refresh
    assert.equal((await LibraryNodes.findOneAsync(referenceId))?.cache?.node?.name, 'Next door');
  });
});
