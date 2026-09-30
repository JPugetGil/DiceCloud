import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import Libraries from '/imports/api/library/Libraries';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import insertPropertyFromLibraryNode from '/imports/api/creature/creatureProperties/methods/insertPropertyFromLibraryNode';

// Inserting from a library needs permission to view it, and so does every
// library that a reference node inside it points to
const [userId, otherUserId, creatureId, ownLibrary, privateLibrary] =
  [Random.id(), Random.id(), Random.id(), Random.id(), Random.id()];
const [ownNode, privateNode, referenceNode] = [Random.id(), Random.id(), Random.id()];

const libraryNode = (_id, library, fields) => ({
  _id, tags: [], left: 1, right: 2,
  root: { collection: 'libraries', id: library },
  ...fields,
});

const insert = nodeId => insertPropertyFromLibraryNode._execute({ userId }, {
  nodeIds: [nodeId],
  parentRef: { collection: 'creatures', id: creatureId },
});

describe('Insert property from library node', function () {
  before(async function () {
    if (!Meteor.isServer) this.skip();
    await Meteor.users.insertAsync({ _id: userId, username: `test-${userId}` });
    await Meteor.users.insertAsync({ _id: otherUserId, username: `test-${otherUserId}` });
    await Creatures.rawCollection().insertOne({ _id: creatureId, name: 'Test', owner: userId });
    await Libraries.rawCollection().insertOne({ _id: ownLibrary, name: 'Own', owner: userId });
    await Libraries.rawCollection().insertOne({ _id: privateLibrary, name: 'Private', owner: otherUserId });
    for (const doc of [
      libraryNode(ownNode, ownLibrary, { type: 'folder', name: 'Own folder' }),
      libraryNode(referenceNode, ownLibrary, {
        type: 'reference', ref: { collection: 'libraryNodes', id: privateNode },
      }),
      libraryNode(privateNode, privateLibrary, { type: 'folder', name: 'Private folder' }),
    ]) {
      await LibraryNodes.rawCollection().insertOne(doc);
    }
  });

  after(async function () {
    if (!Meteor.isServer) return;
    await CreatureProperties.removeAsync({ 'root.id': creatureId });
    await Creatures.removeAsync(creatureId);
    await LibraryNodes.removeAsync({ 'root.id': { $in: [ownLibrary, privateLibrary] } });
    await Libraries.removeAsync({ _id: { $in: [ownLibrary, privateLibrary] } });
    await Meteor.users.removeAsync({ _id: { $in: [userId, otherUserId] } });
  });

  it('Inserts a node from a library the user can view', async function () {
    await insert(ownNode);
    assert.exists(await CreatureProperties.findOneAsync({ 'root.id': creatureId, libraryNodeId: ownNode }));
  });

  it('Refuses a node from a library the user cannot view', async function () {
    /** @type {any} */
    let error;
    try {
      await insert(privateNode);
    } catch (e) {
      error = e;
    }
    assert.equal(error?.error, 'View permission denied');
    assert.notExists(await CreatureProperties.findOneAsync({ 'root.id': creatureId, name: 'Private folder' }));
  });

  it('Keeps a reference into a library the user cannot view as an error', async function () {
    await insert(referenceNode);
    assert.notExists(await CreatureProperties.findOneAsync({ 'root.id': creatureId, name: 'Private folder' }));
    const reference = await CreatureProperties.findOneAsync({ 'root.id': creatureId, type: 'reference' });
    assert.match(reference?.cache?.error, /permission/i);
  });
});
