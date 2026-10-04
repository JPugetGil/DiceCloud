import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import { buffDurationRounds, buffRoundsLeft } from '/imports/api/creature/creatureFolders/buffDurations';
import {
  advanceInitiative, rollInitiative, setTrackDurations,
} from '/imports/api/creature/creatureFolders/methods/initiativeMethods';
import setBuffDuration from '/imports/api/creature/creatureProperties/methods/setBuffDuration';

describe('Effect durations', function () {
  describe('buffDurationRounds', function () {
    const rounds = (calculation?: string, value?: unknown) => buffDurationRounds({ duration: { calculation, value } });

    it('reads a number of rounds, and the libraries\' text durations', function () {
      assert.equal(rounds('3'), 3);
      assert.equal(rounds('1 minute'), 10);
      assert.equal(rounds('10 Minutes'), 100);
      assert.equal(rounds('1 Turn'), 1);
      assert.equal(rounds('2 rounds'), 2);
      assert.equal(rounds('1 hour'), 600);
      assert.equal(rounds('level', 4), 4, 'a computed duration');
    });

    it('has no rounds for no duration, or one not counted in rounds', function () {
      assert.isUndefined(buffDurationRounds({}));
      assert.isUndefined(rounds(''));
      assert.isUndefined(rounds('Until dispelled'));
      assert.isUndefined(rounds('1 day'));
      assert.isUndefined(rounds('0'));
      assert.isUndefined(rounds('x', 0));
    });

    it('counts the rounds left', function () {
      assert.equal(buffRoundsLeft({ duration: { calculation: '1 minute' }, durationSpent: 3 }), 7);
      assert.equal(buffRoundsLeft({ duration: { calculation: '2' }, durationSpent: 5 }), 0);
      assert.isUndefined(buffRoundsLeft({ durationSpent: 2 }));
    });
  });

  describe('in the initiative tracker', function () {
    const [gmId, playerId, folderId, heroId, strangerHeroId] =
      [Random.id(), Random.id(), Random.id(), Random.id(), Random.id()];
    const [blessId, hasteId, rageId, childId, readOnlyBuffId] =
      [Random.id(), Random.id(), Random.id(), Random.id(), Random.id()];
    const as = (method, args, userId = gmId) => method._execute({ userId }, { folderId, ...args });
    const setDuration = (args, userId = gmId) => (setBuffDuration as any)._execute({ userId }, args);
    const buff = (id: string) => CreatureProperties.findOneAsync(id);

    async function removeAll() {
      await CreatureFolders.removeAsync(folderId);
      await Creatures.removeAsync({ _id: { $in: [heroId, strangerHeroId] } });
      await CreatureProperties.removeAsync({ 'root.id': { $in: [heroId, strangerHeroId] } });
      await CreatureLogs.removeAsync({ creatureId: { $in: [heroId, strangerHeroId] } });
      await Meteor.users.removeAsync({ _id: { $in: [gmId, playerId] } });
    }

    beforeEach(async function () {
      if (!Meteor.isServer) this.skip();
      await removeAll();
      await Meteor.users.rawCollection().insertMany([
        { _id: gmId, createdAt: new Date() },
        { _id: playerId, createdAt: new Date() },
      ] as any[]);
      await Creatures.rawCollection().insertMany([
        // The game master edits the hero, and only reads the stranger's
        { _id: heroId, name: 'Hero', owner: playerId, readers: [], writers: [gmId] },
        { _id: strangerHeroId, name: 'Stranger', owner: playerId, readers: [gmId], writers: [] },
      ] as any[]);
      const root = (id: string) => ({ collection: 'creatures', id });
      await CreatureProperties.rawCollection().insertMany([
        { _id: blessId, type: 'buff', name: 'Bless', root: root(heroId), left: 1, right: 2, duration: { calculation: '2' } },
        {
          _id: hasteId, type: 'buff', name: 'Haste', root: root(heroId), left: 3, right: 6,
          duration: { calculation: '1 minute' }, durationSpent: 9,
        },
        // Inside Haste, with a longer duration: it ends with Haste
        {
          _id: childId, type: 'buff', name: 'Haste extra', root: root(heroId), parentId: hasteId,
          left: 4, right: 5, duration: { calculation: '5' },
        },
        { _id: rageId, type: 'buff', name: 'Rage', root: root(heroId), left: 7, right: 8 },
        {
          _id: readOnlyBuffId, type: 'buff', name: 'Shield of Faith', root: root(strangerHeroId), left: 1, right: 2,
          duration: { calculation: '1' },
        },
      ] as any[]);
      await CreatureFolders.rawCollection().insertOne({
        _id: folderId, name: 'Table', owner: gmId, members: [], creatures: [heroId, strangerHeroId], order: 0,
        initiative: {
          round: 1,
          turn: 0,
          entries: [
            { _id: 'entry-goblin', name: 'Goblin', initiative: 20, bonus: 0 },
            { _id: 'entry-hero', creatureId: heroId, name: 'Hero', initiative: 15, bonus: 0 },
            { _id: 'entry-stranger', creatureId: strangerHeroId, name: 'Stranger', initiative: 10, bonus: 0 },
          ],
        },
      } as any);
    });

    after(async function () {
      if (!Meteor.isServer) return;
      await removeAll();
    });

    it('counts the effects of the creature whose turn starts down, and ends those spent', async function () {
      // The hero's turn
      await as(advanceInitiative, { step: 1 });
      assert.equal((await buff(blessId))?.durationSpent, 1);
      assert.isTrue((await buff(hasteId))?.removed, 'its tenth round is spent');
      assert.isTrue((await buff(childId))?.removed, 'gone with Haste');
      assert.isUndefined((await buff(rageId))?.durationSpent, 'no duration: not counted');
      const log = await CreatureLogs.findOneAsync({ creatureId: heroId });
      assert.deepEqual(log?.content?.map(line => line.name), ['Haste']);

      // Going back gives no round back; a new round ends Bless
      await as(advanceInitiative, { step: -1 });
      assert.equal((await buff(blessId))?.durationSpent, 1);
      await as(advanceInitiative, { step: 1 });
      assert.isTrue((await buff(blessId))?.removed);
    });

    it('leaves the creatures the game master can\'t edit alone', async function () {
      await as(advanceInitiative, { step: 1 });
      await as(advanceInitiative, { step: 1 });
      const shield = await buff(readOnlyBuffId);
      assert.isNotTrue(shield?.removed);
      assert.isUndefined(shield?.durationSpent);
    });

    it('counts nothing once the game master turns it off', async function () {
      await assertRefused(as(setTrackDurations, { trackDurations: false }, playerId), 'only the game master');
      await as(setTrackDurations, { trackDurations: false });
      assert.isFalse((await CreatureFolders.findOneAsync(folderId))?.trackDurations);
      await as(advanceInitiative, { step: 1 });
      assert.isUndefined((await buff(blessId))?.durationSpent);
      assert.isNotTrue((await buff(hasteId))?.removed);
      await as(setTrackDurations, { trackDurations: true });
      assert.isUndefined((await CreatureFolders.findOneAsync(folderId))?.trackDurations, 'on: the default');
    });

    it('counts the first turn of a new combat', async function () {
      // The hero alone, so that it starts whatever the dice
      await CreatureFolders.updateAsync(folderId, { $set: { creatures: [heroId] }, $unset: { initiative: 1 } });
      await as(rollInitiative, {});
      assert.equal((await buff(blessId))?.durationSpent, 1);
    });

    it('sets an effect\'s duration for whoever may edit its creature', async function () {
      await setDuration({ _id: rageId, rounds: 3 });
      const rage = await buff(rageId);
      assert.equal(rage?.duration?.calculation, '3');
      assert.equal(buffRoundsLeft(rage as any), 3);

      await CreatureProperties.rawCollection().updateOne({ _id: blessId }, { $set: { durationSpent: 1 } });
      await setDuration({ _id: blessId, rounds: 10 });
      assert.equal(buffRoundsLeft(await buff(blessId) as any), 10, 'counted from now');
      await setDuration({ _id: blessId });
      assert.isUndefined((await buff(blessId))?.duration, 'until removed');

      await assertRefused(setDuration({ _id: readOnlyBuffId, rounds: 3 }), 'a creature it only reads');
    });

    async function assertRefused(promise: Promise<unknown>, message: string) {
      let error;
      try {
        await promise;
      } catch (e) {
        error = e;
      }
      assert.exists(error, message);
    }
  });
});
