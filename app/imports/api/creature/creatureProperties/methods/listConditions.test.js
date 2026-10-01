import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import Libraries from '/imports/api/library/Libraries';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import listConditions from '/imports/api/creature/creatureProperties/methods/listConditions';
import { isCondition } from '/imports/api/creature/creatureProperties/conditions';

describe('Conditions', function () {
  const [userId, otherUserId, englishId, frenchId, creatureId] =
    [Random.id(), Random.id(), Random.id(), Random.id(), Random.id()];
  const list = (user = userId) => listConditions._execute({ userId: user }, { creatureId });
  let left = 0;
  const node = (libraryId, fields) => LibraryNodes.rawCollection().insertOne({
    _id: Random.id(), root: { collection: 'libraries', id: libraryId }, left: left += 2, right: left + 1, ...fields,
  });

  before(async function () {
    if (!Meteor.isServer) this.skip();
    await Meteor.users.insertAsync({ _id: userId, username: `test-${userId}` });
    await Meteor.users.insertAsync({ _id: otherUserId, username: `test-${otherUserId}` });
    for (const _id of [englishId, frenchId]) {
      await Libraries.rawCollection().insertOne({ _id, name: _id, owner: userId, readers: [], writers: [] });
    }
    await Creatures.rawCollection().insertOne({ _id: creatureId, name: 'Hero', owner: userId, readers: [], writers: [] });
    await node(englishId, { type: 'buff', name: 'Blinded', libraryTags: ['condition', 'LoV', 'blindedCondition'] });
    await node(englishId, { type: 'buff', name: 'Prone', libraryTags: ['condition', 'LoV', 'proneCondition'] });
    await node(englishId, { type: 'buff', name: 'Removed', libraryTags: ['condition'], removed: true });
    await node(englishId, { type: 'effect', name: 'Not a buff', libraryTags: ['condition'] });
    await node(englishId, { type: 'buff', name: 'Rage', libraryTags: ['rage'] });
    await node(frenchId, { type: 'buff', name: 'Aveuglé', libraryTags: ['condition', 'LoV', 'blindedCondition'] });
    await node(frenchId, { type: 'buff', name: 'Hexed', libraryTags: ['condition'] });
  });

  after(async function () {
    if (!Meteor.isServer) return;
    await LibraryNodes.removeAsync({ 'root.id': { $in: [englishId, frenchId] } });
    await Libraries.removeAsync({ _id: { $in: [englishId, frenchId] } });
    await Creatures.removeAsync(creatureId);
    await Meteor.users.removeAsync({ _id: { $in: [userId, otherUserId] } });
  });

  it('lists each condition of the character\'s libraries once', async function () {
    const names = (await list()).map(condition => condition.name);
    assert.includeMembers(names, ['Prone', 'Hexed']);
    assert.notIncludeMembers(names, ['Removed', 'Not a buff', 'Rage']);
    // The same condition in two languages: one of them
    assert.equal(names.filter(name => name === 'Blinded' || name === 'Aveuglé').length, 1);
    assert.equal(names.length, 3);
  });

  it('is only for the character\'s editors', async function () {
    let error;
    try {
      await list(otherUserId);
    } catch (e) {
      error = e;
    }
    assert.equal(error?.error, 'Edit permission denied');
  });

  it('knows a condition on a character by its library node, tags or name', function () {
    const blinded = { _id: 'blindedNode', name: 'Blinded', tags: ['LoV', 'blindedCondition'] };
    const hexed = { _id: 'hexedNode', name: 'Hexed', tags: [] };
    assert.isTrue(isCondition({ libraryNodeId: 'blindedNode' }, blinded));
    assert.isTrue(isCondition({ name: 'Aveuglé', tags: ['blindedCondition', 'LoV', 'healRemove'] }, blinded));
    assert.isTrue(isCondition({ name: ' hexed ' }, hexed));
    assert.isFalse(isCondition({ name: 'Deafened', tags: ['LoV', 'deafenedCondition'] }, blinded));
  });
});
