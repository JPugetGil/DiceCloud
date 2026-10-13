import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import moveCreatureToFolder from '/imports/api/creature/creatureFolders/methods/moveCreatureToFolder';

describe('Moving a creature to a folder', function () {
  const [userId, otherId] = [Random.id(), Random.id()];
  const [folderId, otherFolderId, othersFolderId] = [Random.id(), Random.id(), Random.id()];
  const [own, shared, othersPrivate] = [Random.id(), Random.id(), Random.id()];
  const move = (args: object, asUser = userId) => (moveCreatureToFolder as any)._execute({ userId: asUser }, args);
  const creaturesIn = async (id: string) => (await CreatureFolders.findOneAsync(id))?.creatures;

  async function refusal(args: object) {
    try {
      await move(args);
    } catch (e) {
      return e as Meteor.Error;
    }
    assert.fail(`moved with ${JSON.stringify(args)}`);
  }

  async function removeAll() {
    for (const id of [folderId, otherFolderId, othersFolderId]) await CreatureFolders.removeAsync(id);
    await Creatures.removeAsync({ _id: { $in: [own, shared, othersPrivate] } });
    await Meteor.users.removeAsync({ _id: { $in: [userId, otherId] } });
  }

  beforeEach(async function () {
    if (!Meteor.isServer) this.skip();
    await removeAll();
    await Meteor.users.rawCollection().insertMany([userId, otherId].map(_id => ({
      _id, createdAt: new Date(), username: `move-folder-test-${_id}`,
    })) as any[]);
    const creature = (_id: string, owner: string, readers: string[] = []) => ({
      _id, owner, readers, writers: [], public: false, name: `Creature ${_id}`, type: 'pc',
    });
    await Creatures.rawCollection().insertMany([
      creature(own, userId),
      creature(shared, otherId, [userId]),
      creature(othersPrivate, otherId),
    ] as any[]);
    await CreatureFolders.rawCollection().insertMany([
      { _id: folderId, owner: userId, name: 'Folder', creatures: [own] },
      { _id: otherFolderId, owner: userId, name: 'Other folder', creatures: [] },
      { _id: othersFolderId, owner: otherId, name: 'Not mine', creatures: [] },
    ] as any[]);
  });

  after(removeAll);

  it('moves a creature from one of the user\'s folders to another, and out of them', async function () {
    await move({ creatureId: own, folderId: otherFolderId });
    assert.deepEqual(await creaturesIn(folderId), []);
    assert.deepEqual(await creaturesIn(otherFolderId), [own]);
    // The list sends null for "no folder"
    await move({ creatureId: own, folderId: null });
    assert.deepEqual(await creaturesIn(otherFolderId), []);
  });

  it('files a character shared with the user, and takes one out once it no longer is', async function () {
    await move({ creatureId: shared, folderId: otherFolderId });
    assert.deepEqual(await creaturesIn(otherFolderId), [shared]);
    await Creatures.updateAsync(shared, { $set: { readers: [] } }, { bypassCollection2: true } as any);
    await move({ creatureId: shared });
    assert.deepEqual(await creaturesIn(otherFolderId), []);
  });

  it('refuses ids that are not ids: they went into the update as operators', async function () {
    // { $ne: null } pulled every creature out of every folder of the user's
    const error = await refusal({ creatureId: { $ne: null }, folderId: null });
    assert.equal(error.error, 'validation-error');
    assert.deepEqual(await creaturesIn(folderId), [own]);
    assert.equal((await refusal({ creatureId: own, folderId: { owner: userId } })).error, 'validation-error');
    assert.equal((await refusal({ creatureId: own, folderId: otherFolderId, extra: true })).error, 'validation-error');
    assert.deepEqual(await creaturesIn(otherFolderId), []);
  });

  it('refuses to file a creature the user cannot see, or into another user\'s folder', async function () {
    await refusal({ creatureId: othersPrivate, folderId: otherFolderId });
    assert.deepEqual(await creaturesIn(otherFolderId), []);
    await refusal({ creatureId: Random.id(), folderId: otherFolderId });
    assert.deepEqual(await creaturesIn(otherFolderId), []);
    await refusal({ creatureId: own, folderId: othersFolderId });
    assert.deepEqual(await creaturesIn(othersFolderId), []);
  });
});
