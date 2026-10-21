import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import removeCreatureFolder from '/imports/api/creature/creatureFolders/methods/removeCreatureFolder';
import updateCreatureFolderName from '/imports/api/creature/creatureFolders/methods/updateCreatureFolderName';
import pushToProperty from '/imports/api/creature/creatureProperties/methods/pushToProperty';
import pullFromProperty from '/imports/api/creature/creatureProperties/methods/pullFromProperty';
import { toggleAllUserLibraries } from '/imports/api/creature/creatures/methods/changeAllowedLibraries';

/*
 * Ids from the client are strings, never selectors: a method that checks the
 * first document an object `_id` finds, then writes with the same `_id`,
 * reaches every document it matches. `{ _id: { $in: [mine, theirs] } }` removed
 * another user's party along with one's own.
 */
const as = (method: unknown, userId: string, args: unknown) =>
  (method as { _execute(invocation: { userId: string }, args: unknown): Promise<unknown> })._execute({ userId }, args);

// The validation throws before the method returns a promise: called here
async function rejects(call: () => Promise<unknown>, what: string) {
  try {
    await call();
  } catch {
    return;
  }
  assert.fail(`${what} was accepted`);
}

if (Meteor.isServer) describe('Method arguments: ids, never selectors', function () {
  const attacker = Random.id();
  const victim = Random.id();
  let created: { folders: string[], creatures: string[], props: string[] };

  beforeEach(async function () {
    created = { folders: [], creatures: [], props: [] };
    for (const _id of [attacker, victim]) {
      await Meteor.users.rawCollection().insertOne({ _id, username: `args-${_id}`, createdAt: new Date() } as any);
    }
  });

  afterEach(async function () {
    await Meteor.users.removeAsync({ _id: { $in: [attacker, victim] } });
    await CreatureFolders.removeAsync({ _id: { $in: created.folders } });
    await Creatures.removeAsync({ _id: { $in: created.creatures } });
    await CreatureProperties.removeAsync({ _id: { $in: created.props } });
  });

  const folderOf = async (owner: string, name: string) => {
    const _id = await CreatureFolders.insertAsync({ owner, name, creatures: [], members: [] } as any);
    created.folders.push(_id);
    return _id;
  };

  it('removes one\'s own folder, never another\'s through a selector', async function () {
    // Inserted first: the attacker's folder comes first in natural order
    const own = await folderOf(attacker, 'Mine');
    const theirs = await folderOf(victim, 'Theirs');
    await rejects(() => as(removeCreatureFolder, attacker, { _id: { _id: { $in: [own, theirs] } } }), 'a selector');
    assert.exists(await CreatureFolders.findOneAsync(theirs), 'the other user\'s folder is still there');
    await rejects(() => as(removeCreatureFolder, attacker, { _id: theirs }), 'another\'s folder');
    await as(removeCreatureFolder, attacker, { _id: own });
    assert.notExists(await CreatureFolders.findOneAsync(own));
  });

  it('renames one\'s own folder only, by its id', async function () {
    const own = await folderOf(attacker, 'Mine');
    const theirs = await folderOf(victim, 'Theirs');
    await rejects(() => as(updateCreatureFolderName, attacker, { _id: { _id: { $in: [own, theirs] } }, name: 'Pwned' }), 'a selector');
    assert.equal((await CreatureFolders.findOneAsync(theirs))?.name, 'Theirs');
    await as(updateCreatureFolderName, attacker, { _id: own, name: 'Renamed' });
    assert.equal((await CreatureFolders.findOneAsync(own))?.name, 'Renamed');
  });

  it('refuses a selector or an operator in a property\'s push and pull', async function () {
    const creatureId = await Creatures.insertAsync({ owner: attacker, name: 'Hero', type: 'pc' } as any);
    created.creatures.push(creatureId);
    const propId = await CreatureProperties.insertAsync({
      type: 'note', name: 'Note', root: { collection: 'creatures', id: creatureId },
      parentId: creatureId, left: 1, right: 2,
    } as any);
    created.props.push(propId);
    await rejects(() => as(pushToProperty, attacker, { _id: { _id: { $in: [propId] } }, path: ['tags'], value: 'x' }), 'a selector');
    await rejects(() => as(pushToProperty, attacker, { _id: propId, path: ['$where'], value: 'x' }), 'an operator in the path');
    await rejects(() => as(pullFromProperty, attacker, { _id: { _id: { $ne: null } }, path: ['tags'], itemId: 'x' }), 'a selector');
    await rejects(() => as(pullFromProperty, attacker, { _id: propId, path: ['tags'], itemId: { $ne: null } }), 'a selector as the item');
  });

  it('lifts a character\'s library limits for its editors only', async function () {
    const creatureId = await Creatures.insertAsync({
      owner: victim, name: 'Hero', type: 'pc', allowedLibraries: ['lib1'],
    } as any);
    created.creatures.push(creatureId);
    await rejects(() => as(toggleAllUserLibraries, attacker, { _id: creatureId, value: false }), 'a stranger');
    assert.deepEqual((await Creatures.findOneAsync(creatureId))?.allowedLibraries, ['lib1']);
    await as(toggleAllUserLibraries, victim, { _id: creatureId, value: false });
    assert.deepEqual((await Creatures.findOneAsync(creatureId))?.allowedLibraries, []);
  });
});
