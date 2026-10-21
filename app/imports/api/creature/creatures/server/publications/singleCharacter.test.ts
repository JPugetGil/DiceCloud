import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { DDP } from 'meteor/ddp';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { loadedCreatures } from '/imports/api/engine/loadCreatures';
import '/imports/api/creature/creatures/server/publications/singleCharacter';

/*
 * A character sheet's publication refuses an id that is not one, and stops
 * there. It used to go on after its error; a later check happened to throw
 * before anything loaded, but an object id that reached loadCreature would
 * stay loaded under that object, its observers running for good (security
 * review of 2026-10-21; not reproduced: the guard is this test).
 */
if (Meteor.isServer) describe('The character sheet\'s publication', function () {
  this.timeout(20000);
  let creatureId: string;

  before(async function () {
    creatureId = await Creatures.insertAsync({ owner: Random.id(), name: 'Public hero', type: 'pc', public: true } as any);
  });

  after(async function () {
    await Creatures.removeAsync(creatureId);
  });

  it('refuses an object for an id, loading nothing', async function () {
    const connection = DDP.connect(Meteor.absoluteUrl());
    try {
      const error = await new Promise(resolve => connection.subscribe('singleCharacter', { $in: [creatureId] }, {
        onReady: () => resolve(undefined),
        onStop: (stopError: unknown) => resolve(stopError),
      }));
      assert.exists(error, 'the subscription is refused');
      await new Promise(resolve => setTimeout(resolve, 500));
      assert.isFalse([...loadedCreatures.keys()].some(key => typeof key !== 'string'), 'no creature loaded under an object');
    } finally {
      connection.disconnect();
    }
  });
});
