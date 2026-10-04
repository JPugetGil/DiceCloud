import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import Experiences, {
  insertExperience, MAX_EXPERIENCE_CREATURES,
} from '/imports/api/creature/experience/Experiences';

describe('Giving experience to several characters', function () {
  const [gmId, playerId] = [Random.id(), Random.id()];
  // The game master owns the first two, can edit the third, and only read the last
  const [ownedA, ownedB, shared, readOnly] = [Random.id(), Random.id(), Random.id(), Random.id()];
  const creatureIds = [ownedA, ownedB, shared, readOnly];
  // Dated, as the client's form fills it in
  const give = (ids: string[], experience: object = { xp: 300 }) => (insertExperience as any)
    ._execute({ userId: gmId }, { experience: { date: new Date(), ...experience }, creatureIds: ids });
  const xpOf = async (id: string) =>
    (await Creatures.findOneAsync(id))?.denormalizedStats?.xp || 0;

  beforeEach(async function () {
    if (!Meteor.isServer) this.skip();
    await Experiences.removeAsync({ creatureId: { $in: creatureIds } });
    await Creatures.removeAsync({ _id: { $in: creatureIds } });
    await Meteor.users.removeAsync({ _id: { $in: [gmId, playerId] } });
    await Meteor.users.rawCollection().insertMany([
      { _id: gmId, createdAt: new Date() },
      { _id: playerId, createdAt: new Date() },
    ] as any[]);
    const creature = (_id: string, owner: string, extra = {}) => ({
      _id, owner, name: 'XP test character', type: 'pc', readers: [], writers: [], ...extra,
    });
    await Creatures.rawCollection().insertMany([
      creature(ownedA, gmId),
      creature(ownedB, gmId),
      creature(shared, playerId, { writers: [gmId] }),
      creature(readOnly, playerId, { readers: [gmId] }),
    ] as any[]);
  });

  after(async function () {
    if (!Meteor.isServer) return;
    await Experiences.removeAsync({ creatureId: { $in: creatureIds } });
    await Creatures.removeAsync({ _id: { $in: creatureIds } });
    await Meteor.users.removeAsync({ _id: { $in: [gmId, playerId] } });
  });

  it('gives the experience to every character the user can edit', async function () {
    const ids = await give([ownedA, ownedB, shared]);
    assert.lengthOf(ids, 3);
    for (const id of [ownedA, ownedB, shared]) {
      assert.equal(await xpOf(id), 300);
      assert.equal(await Experiences.find({ creatureId: id, xp: 300 }).countAsync(), 1);
    }
  });

  it('gives nothing when one of the characters can\'t be edited', async function () {
    let error;
    try {
      await give([ownedA, readOnly]);
    } catch (e) {
      error = e;
    }
    assert.exists(error);
    assert.equal(await xpOf(ownedA), 0);
    assert.equal(await Experiences.find({ creatureId: { $in: creatureIds } }).countAsync(), 0);
  });

  it('gives it once to a character listed twice', async function () {
    await give([ownedA, ownedA], { levels: 1 });
    assert.equal(await Experiences.find({ creatureId: ownedA }).countAsync(), 1);
    const creature = await Creatures.findOneAsync(ownedA);
    assert.equal(creature?.denormalizedStats?.milestoneLevels, 1);
  });

  it('refuses no characters, and more than a party', async function () {
    for (const ids of [[], Array.from({ length: MAX_EXPERIENCE_CREATURES + 1 }, () => ownedA)]) {
      let error;
      try {
        await give(ids);
      } catch (e) {
        error = e;
      }
      assert.exists(error, `${ids.length} characters`);
    }
  });
});
