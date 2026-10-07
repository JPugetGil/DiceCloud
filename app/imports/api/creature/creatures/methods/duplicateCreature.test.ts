import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import Experiences from '/imports/api/creature/experience/Experiences';
import { removeCreatureWork } from '/imports/api/creature/creatures/methods/removeCreature';
import duplicateCreature, { insertCreatureCopy } from '/imports/api/creature/creatures/methods/duplicateCreature';
import getCreatureArchive from '/imports/api/creature/archive/methods/getCreatureArchive';

describe('Duplicating a character', function () {
  const [ownerId, readerId, copierId] = [Random.id(), Random.id(), Random.id()];
  const userIds = [ownerId, readerId, copierId];
  const originalId = Random.id();
  const [folderId, itemId, actionId, buffId, removedId] = [Random.id(), Random.id(), Random.id(), Random.id(), Random.id()];
  const as = (method, userId: string, args: object) => method._execute({ userId }, args);

  async function removeAll() {
    const creatures = await Creatures.find({ owner: { $in: userIds } }, { fields: { _id: 1 } }).fetchAsync();
    for (const { _id } of creatures) await removeCreatureWork(_id);
    await Meteor.users.removeAsync({ _id: { $in: userIds } });
  }

  beforeEach(async function () {
    if (!Meteor.isServer) this.skip();
    await removeAll();
    await Meteor.users.rawCollection().insertMany([
      { _id: ownerId, createdAt: new Date() },
      { _id: readerId, createdAt: new Date() },
      { _id: copierId, createdAt: new Date() },
    ] as any[]);
    await Creatures.rawCollection().insertOne({
      _id: originalId, owner: ownerId, name: 'Original', type: 'pc',
      readers: [readerId, copierId], writers: [], public: false, readersCanCopy: false,
      settings: { discordWebhook: 'https://discord.com/api/webhooks/1/secret', hideSpellsTab: true },
      denormalizedStats: { xp: 300, milestoneLevels: 0 },
    } as any);
    const root = { collection: 'creatures', id: originalId };
    await CreatureProperties.rawCollection().insertMany([
      { _id: folderId, type: 'folder', name: 'Gear', root, parentId: originalId, left: 1, right: 6 },
      { _id: itemId, type: 'item', name: 'Arrows', root, parentId: folderId, left: 2, right: 3 },
      {
        _id: actionId, type: 'action', name: 'Shoot', root, parentId: folderId, left: 4, right: 5,
        resources: { itemsConsumed: [{ _id: Random.id(), itemId }], attributesConsumed: [] },
      },
      {
        _id: buffId, type: 'buff', name: 'Focus', root, parentId: originalId, left: 7, right: 8,
        appliedBy: { id: originalId, collection: 'creatures', name: 'Original' },
      },
      { _id: removedId, type: 'note', name: 'Gone', root, parentId: originalId, left: 9, right: 10, removed: true },
    ] as any[]);
    await Experiences.rawCollection().insertOne({
      _id: Random.id(), creatureId: originalId, xp: 300, date: new Date(),
    } as any);
    await CreatureLogs.rawCollection().insertOne({
      _id: Random.id(), creatureId: originalId, content: [{ name: 'Rolled' }], date: new Date(),
    } as any);
  });

  after(async function () {
    if (!Meteor.isServer) return;
    await removeAll();
  });

  it('copies the character with new ids, references included', async function () {
    const copyId = await as(duplicateCreature, ownerId, { creatureId: originalId, name: 'Original (copy)' });
    assert.notEqual(copyId, originalId);

    const copy = await Creatures.findOneAsync(copyId);
    assert.equal(copy?.name, 'Original (copy)');
    assert.equal(copy?.owner, ownerId);
    assert.deepEqual(copy?.readers, []);
    assert.isUndefined(copy?.settings?.discordWebhook, 'the webhook stays with the original');
    assert.isTrue(copy?.settings?.hideSpellsTab);

    const props = await CreatureProperties.find({ 'root.id': copyId }).fetchAsync();
    assert.sameMembers(props.map(prop => prop.name), ['Gear', 'Arrows', 'Shoot', 'Focus'],
      'everything but the removed property');
    const byName = Object.fromEntries(props.map(prop => [prop.name, prop as any]));
    for (const prop of props) {
      assert.notInclude([folderId, itemId, actionId, buffId], prop._id);
    }
    assert.equal(byName.Arrows.parentId, byName.Gear._id);
    // No parent id also means the character is the parent, as the engine writes it
    assert.include([copyId, undefined], byName.Gear.parentId);
    assert.equal(byName.Shoot.resources.itemsConsumed[0].itemId, byName.Arrows._id,
      'the ammunition is the copy\'s');
    assert.equal(byName.Focus.appliedBy.id, copyId);

    const experiences = await Experiences.find({ creatureId: copyId }).fetchAsync();
    assert.lengthOf(experiences, 1);
    assert.equal(experiences[0].xp, 300);
    assert.equal(await CreatureLogs.find({ creatureId: copyId }).countAsync(), 0, 'the log stays');

    // The original is untouched
    assert.equal(await CreatureProperties.find({ 'root.id': originalId }).countAsync(), 5);
    assert.equal((await Creatures.findOneAsync(originalId))?.name, 'Original');
  });

  it('only lets readers copy a character whose readers may copy it', async function () {
    let error;
    try {
      await as(duplicateCreature, readerId, { creatureId: originalId });
    } catch (e) {
      error = e;
    }
    assert.exists(error);

    await Creatures.rawCollection().updateOne({ _id: originalId }, { $set: { readersCanCopy: true } });
    const copyId = await as(duplicateCreature, readerId, { creatureId: originalId });
    assert.equal((await Creatures.findOneAsync(copyId))?.owner, readerId);
    assert.equal((await Creatures.findOneAsync(copyId))?.name, 'Original', 'the original\'s name by default');
  });

  it('counts the copy towards the character limit', async function () {
    await Creatures.rawCollection().updateOne({ _id: originalId }, { $set: { readersCanCopy: true } });
    // A player owns up to 2 characters
    await as(duplicateCreature, copierId, { creatureId: originalId });
    await as(duplicateCreature, copierId, { creatureId: originalId });
    let error;
    try {
      await as(duplicateCreature, copierId, { creatureId: originalId });
    } catch (e) {
      error = e;
    }
    assert.exists(error);
    assert.equal(await Creatures.find({ owner: copierId }).countAsync(), 2);
  });

  it('makes the copy of a monster a player character, which the limit counts', async function () {
    // Monsters don't count towards the limit: a copy that stayed one would get round it
    await Creatures.rawCollection().updateOne({ _id: originalId }, { $set: { type: 'monster' } });
    const copyId = await as(duplicateCreature, ownerId, { creatureId: originalId });
    assert.equal((await Creatures.findOneAsync(copyId))?.type, 'pc');
  });

  it('downloads the archive of a character it can copy, without changing it', async function () {
    const archive = await as(getCreatureArchive, ownerId, { creatureId: originalId });
    assert.equal(archive.creature._id, originalId);
    assert.lengthOf(archive.properties, 5);
    assert.lengthOf(archive.logs, 1);
    assert.exists(await Creatures.findOneAsync(originalId));

    let error;
    try {
      await as(getCreatureArchive, readerId, { creatureId: originalId });
    } catch (e) {
      error = e;
    }
    assert.exists(error, 'a reader who may not copy it can\'t download it');
  });

  it('keeps the Discord webhook out of the archive of a reader allowed to copy', async function () {
    const archive = await as(getCreatureArchive, ownerId, { creatureId: originalId });
    assert.equal(archive.creature.settings.discordWebhook, 'https://discord.com/api/webhooks/1/secret');
    await Creatures.updateAsync(originalId, { $set: { readersCanCopy: true } });
    const copy = await as(getCreatureArchive, readerId, { creatureId: originalId });
    assert.notProperty(copy.creature.settings, 'discordWebhook');
    assert.isTrue(copy.creature.settings.hideSpellsTab);
  });

  it('restores an archive of a character that still exists as a copy, log included', async function () {
    const archive = JSON.parse(JSON.stringify(await as(getCreatureArchive, ownerId, { creatureId: originalId })));
    const copyId = await insertCreatureCopy(archive, { owner: ownerId });
    assert.notEqual(copyId, originalId);
    assert.equal(await CreatureLogs.find({ creatureId: copyId }).countAsync(), 1);
    assert.equal(await CreatureLogs.find({ creatureId: originalId }).countAsync(), 1);
  });
});
