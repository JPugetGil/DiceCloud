import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import Libraries from '/imports/api/library/Libraries';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import copyPropertyToLibrary from '/imports/api/creature/creatureProperties/methods/copyPropertyToLibrary';

// Copying a creature's property into a library (the property's menu, "Copy"):
// the copies go under the node picked, in the library; the user must be able
// to edit both, and to copy out of the library the property came from
const [userId, otherUserId, creatureId, otherCreatureId] = [Random.id(), Random.id(), Random.id(), Random.id()];
const [library, otherLibrary, guardedLibrary] = [Random.id(), Random.id(), Random.id()];
const [folderId, guardedNodeId, propId, childId, fromGuardedId, othersPropId] =
  [Random.id(), Random.id(), Random.id(), Random.id(), Random.id(), Random.id()];
const libraries = [library, otherLibrary, guardedLibrary];

const creatureProp = (_id, creature, fields) => ({
  _id, type: 'folder', tags: [], root: { collection: 'creatures', id: creature }, ...fields,
});

/** @returns {Promise<any>} */
const copy = (propToCopy, parentId = folderId, user = userId) => /** @type {any} */ (copyPropertyToLibrary)._execute({ userId: user }, {
  propId: propToCopy, parentRef: { collection: 'libraryNodes', id: parentId },
});
/** @returns {Promise<any>} the error the call was refused with */
async function refusal(call) {
  try {
    await call();
  } catch (error) {
    return error;
  }
  assert.fail('not refused');
}

describe('Copy a property to a library', function () {
  before(async function () {
    if (!Meteor.isServer) this.skip();
    await Meteor.users.insertAsync({ _id: userId, username: `test-${userId}` });
    await Meteor.users.insertAsync({ _id: otherUserId, username: `test-${otherUserId}` });
    await Creatures.rawCollection().insertOne(/** @type {any} */ ({ _id: creatureId, name: 'Mine', owner: userId }));
    await Creatures.rawCollection().insertOne(/** @type {any} */ ({ _id: otherCreatureId, name: 'Theirs', owner: otherUserId }));
    await Libraries.rawCollection().insertOne({ _id: library, name: 'Mine', owner: userId });
    await Libraries.rawCollection().insertOne({ _id: otherLibrary, name: 'Theirs', owner: otherUserId, readers: [userId] });
    // Readable by the user, not copyable
    await Libraries.rawCollection().insertOne({ _id: guardedLibrary, name: 'Guarded', owner: otherUserId, readers: [userId], readersCanCopy: false });
    for (const node of [
      { _id: folderId, root: { collection: 'libraries', id: library }, left: 1, right: 2 },
      { _id: Random.id(), root: { collection: 'libraries', id: otherLibrary }, left: 1, right: 2 },
      { _id: guardedNodeId, root: { collection: 'libraries', id: guardedLibrary }, left: 1, right: 2 },
    ]) {
      await LibraryNodes.rawCollection().insertOne({ type: 'folder', tags: [], ...node });
    }
    for (const prop of [
      creatureProp(propId, creatureId, { name: 'Copied', left: 1, right: 4 }),
      creatureProp(childId, creatureId, { type: 'note', name: 'Its child', parentId: propId, left: 2, right: 3 }),
      creatureProp(fromGuardedId, creatureId, { name: 'From the guarded library', libraryNodeId: guardedNodeId, left: 5, right: 6 }),
      creatureProp(othersPropId, otherCreatureId, { name: 'Not mine', left: 1, right: 2 }),
    ]) {
      await CreatureProperties.rawCollection().insertOne(prop);
    }
  });

  after(async function () {
    if (!Meteor.isServer) return;
    await CreatureProperties.removeAsync({ 'root.id': { $in: [creatureId, otherCreatureId] } });
    await Creatures.removeAsync({ _id: { $in: [creatureId, otherCreatureId] } });
    await LibraryNodes.removeAsync({ 'root.id': { $in: [...libraries, creatureId] } });
    await Libraries.removeAsync({ _id: { $in: libraries } });
    await Meteor.users.removeAsync({ _id: { $in: [userId, otherUserId] } });
  });

  it('puts the copies under the node picked, in its library', async function () {
    const copiedId = await copy(propId);
    /** @type {any[]} */
    const [copied, child, folder] = [
      await LibraryNodes.findOneAsync(copiedId),
      await LibraryNodes.findOneAsync({ parentId: copiedId }),
      await LibraryNodes.findOneAsync(folderId),
    ];
    assert.deepEqual(copied?.root, { collection: 'libraries', id: library });
    assert.equal(copied?.parentId, folderId);
    assert.equal(copied?.name, 'Copied');
    assert.deepEqual(child?.root, { collection: 'libraries', id: library });
    assert.equal(child?.name, 'Its child');
    // In the library's tree: the folder holds the copy, which holds its child
    assert.isTrue(folder.left < copied.left && copied.left < child.left && child.right < copied.right && copied.right < folder.right,
      JSON.stringify({ folder: [folder.left, folder.right], copied: [copied.left, copied.right], child: [child.left, child.right] }));
    // Nothing left outside the library, and the creature keeps its own
    assert.equal(await LibraryNodes.find({ 'root.id': creatureId }).countAsync(), 0);
    assert.equal(await CreatureProperties.find({ 'root.id': creatureId }).countAsync(), 3);
  });

  it('refuses a library the user may not edit', async function () {
    const theirNode = await LibraryNodes.findOneAsync({ 'root.id': otherLibrary });
    const before = await LibraryNodes.find({ 'root.id': otherLibrary }).countAsync();
    const error = await refusal(() => copy(propId, theirNode?._id));
    assert.match(error.error ?? error.message, /permission/i);
    assert.equal(await LibraryNodes.find({ 'root.id': otherLibrary }).countAsync(), before);
  });

  it('refuses another user\'s property', async function () {
    const error = await refusal(() => copy(othersPropId));
    assert.match(error.error ?? error.message, /permission/i);
    assert.notExists(await LibraryNodes.findOneAsync({ name: 'Not mine' }));
  });

  it('refuses a property from a library its owner lets no one copy', async function () {
    const error = await refusal(() => copy(fromGuardedId));
    assert.equal(error.error, 'Copy permission denied');
    assert.notExists(await LibraryNodes.findOneAsync({ name: 'From the guarded library' }));
  });
});
