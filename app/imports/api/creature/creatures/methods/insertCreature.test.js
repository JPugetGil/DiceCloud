import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { DDP } from 'meteor/ddp';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import Experiences from '/imports/api/creature/experience/Experiences';
import Libraries from '/imports/api/library/Libraries';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import insertCreature from '/imports/api/creature/creatures/methods/insertCreature';

// A new character: a private player character with the default sheet (the
// Ruleset slot, the inventory's folders), its starting level, and its slot
// filled with the ruleset chosen, else the only one its libraries hold
const [oneLibraryUser, twoLibrariesUser, limitedUser, otherUserId] = [Random.id(), Random.id(), Random.id(), Random.id()];
const [libraryA, libraryB, privateLibrary] = [Random.id(), Random.id(), Random.id()];
const [rulesetA, rulesetB, privateRuleset] = [Random.id(), Random.id(), Random.id()];
const users = [oneLibraryUser, twoLibrariesUser, limitedUser, otherUserId];
const libraries = [libraryA, libraryB, privateLibrary];

/** Creates a character as `userId`, as the client's call does (the ruleset is inserted by a nested call) */
function create(userId, fields = {}) {
  const invocation = { userId, randomSeed: Random.id(), isSimulation: false };
  return /** @type {Promise<string>} */ (/** @type {any} */ (DDP)._CurrentMethodInvocation.withValue(invocation, () =>
    /** @type {any} */ (insertCreature)._execute({ userId }, { name: 'Hero', startingLevel: 0, ...fields })));
}
const props = creatureId => CreatureProperties.find({ 'root.id': creatureId }, { sort: { left: 1 } }).fetchAsync();
const rulesetOf = async creatureId => (await props(creatureId)).find(prop => prop.name?.startsWith('Ruleset '))?.libraryNodeId;
/** @returns {Promise<any>} the error the call was refused with */
async function refusal(call) {
  try {
    await call();
  } catch (error) {
    return error;
  }
  assert.fail('not refused');
}

describe('Insert a creature', function () {
  this.timeout(10000);

  before(async function () {
    if (!Meteor.isServer) this.skip();
    await Meteor.users.insertAsync({ _id: oneLibraryUser, username: `one-${oneLibraryUser}`, roles: ['activePlayer'] });
    await Meteor.users.insertAsync({ _id: twoLibrariesUser, username: `two-${twoLibrariesUser}`, roles: ['activePlayer'] });
    // A player: two characters at most
    await Meteor.users.insertAsync({ _id: limitedUser, username: `limited-${limitedUser}`, roles: ['player'] });
    await Meteor.users.insertAsync({ _id: otherUserId, username: `other-${otherUserId}` });
    await Libraries.rawCollection().insertOne({ _id: libraryA, name: 'A', owner: oneLibraryUser, readers: [twoLibrariesUser] });
    await Libraries.rawCollection().insertOne({ _id: libraryB, name: 'B', owner: twoLibrariesUser });
    await Libraries.rawCollection().insertOne({ _id: privateLibrary, name: 'Private', owner: otherUserId });
    for (const [_id, library] of [[rulesetA, libraryA], [rulesetB, libraryB], [privateRuleset, privateLibrary]]) {
      await LibraryNodes.rawCollection().insertOne({
        _id, type: 'folder', name: `Ruleset ${library}`, fillSlots: true, libraryTags: ['base'], tags: [],
        left: 1, right: 2, root: { collection: 'libraries', id: library },
      });
    }
  });

  after(async function () {
    if (!Meteor.isServer) return;
    const creatureIds = await Creatures.find({ owner: { $in: users } }).mapAsync(creature => creature._id);
    await CreatureProperties.removeAsync({ 'root.id': { $in: creatureIds } });
    await Experiences.removeAsync({ creatureId: { $in: creatureIds } });
    await Creatures.removeAsync({ _id: { $in: creatureIds } });
    await LibraryNodes.removeAsync({ 'root.id': { $in: libraries } });
    await Libraries.removeAsync({ _id: { $in: libraries } });
    await Meteor.users.removeAsync({ _id: { $in: users } });
  });

  it('makes a private player character with the default sheet, filled with the only ruleset', async function () {
    const creatureId = await create(oneLibraryUser, { startingLevel: 3 });
    const creature = await Creatures.findOneAsync(creatureId);
    assert.include(creature, { owner: oneLibraryUser, name: 'Hero', type: 'pc', public: false });
    assert.deepEqual([creature?.readers, creature?.writers], [[], []]);

    const sheet = await props(creatureId);
    const byName = Object.fromEntries(sheet.map(prop => [prop.name, prop]));
    assert.includeMembers(Object.keys(byName), ['Ruleset', 'Inventory', 'Equipment', 'Carried']);
    const { Inventory: inventory, Equipment: equipment, Carried: carried, Ruleset: slot } = byName;
    for (const folder of [equipment, carried]) {
      assert.equal(folder.parentId, inventory._id);
      assert.isTrue(inventory.left < folder.left && folder.right < inventory.right, folder.name);
    }
    // The ruleset, under the slot
    const ruleset = /** @type {any} */ (sheet.find(prop => prop.libraryNodeId === rulesetA));
    assert.equal(ruleset?.parentId, slot._id);
    assert.isTrue(slot.left < ruleset.left && ruleset.right < slot.right);

    assert.equal((await Experiences.findOneAsync({ creatureId }))?.levels, 3);
  });

  it('takes the ruleset chosen, and none of several unless one is chosen', async function () {
    assert.equal(await rulesetOf(await create(twoLibrariesUser, { rulesetId: rulesetB })), rulesetB);
    assert.isUndefined(await rulesetOf(await create(twoLibrariesUser)));
  });

  it('leaves the slot empty on purpose', async function () {
    assert.isUndefined(await rulesetOf(await create(oneLibraryUser, { withoutRuleset: true })));
  });

  it('never takes a ruleset of a library the character cannot use', async function () {
    const creatureId = await create(oneLibraryUser, { rulesetId: privateRuleset });
    assert.equal(await rulesetOf(creatureId), rulesetA);
    assert.notExists(await CreatureProperties.findOneAsync({ 'root.id': creatureId, libraryNodeId: privateRuleset }));
  });

  it('refuses a signed out user, and a character over the role\'s limit', async function () {
    assert.match((await refusal(() => /** @type {any} */ (insertCreature)._execute({}, { name: 'Ghost', startingLevel: 0 }))).error, /denied/);
    await create(limitedUser, { withoutRuleset: true });
    await create(limitedUser, { withoutRuleset: true });
    const error = await refusal(() => create(limitedUser, { withoutRuleset: true }));
    assert.match(error.reason ?? error.message, /character/i);
    assert.equal(await Creatures.find({ owner: limitedUser }).countAsync(), 2);
  });
});
