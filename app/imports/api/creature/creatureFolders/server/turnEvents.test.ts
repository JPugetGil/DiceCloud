import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import initiativeOrder from '/imports/api/creature/creatureFolders/initiativeOrder';
import {
  advanceInitiative, advanceTracker, removeInitiativeEntry, rollInitiative, setTrackDurations,
} from '/imports/api/creature/creatureFolders/methods/initiativeMethods';
import { endEncounter } from '/imports/api/creature/creatureFolders/methods/monsterMethods';
import { leaveParty } from '/imports/api/creature/creatureFolders/methods/partyMethods';
import removeCreatureFolder from '/imports/api/creature/creatureFolders/methods/removeCreatureFolder';
import removeCreature from '/imports/api/creature/creatures/methods/removeCreature';
// The method alone, not Users.js: its schema would make every suite's test users need its fields
import '/imports/api/users/methods/deleteMyAccount';
import { createTestCreature, removeAllCreaturesAndProps } from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import propsFromForest, { type ForestProp } from '/imports/api/engine/computation/utility/propsFromForest.testFn';
import computeCreature from '/imports/api/engine/computeCreature';

/*
 * The turn events of a party's initiative tracker (phase 3.1): the turn that
 * ends, then the turn that starts, for the party's creatures, players'
 * characters and monsters alike, each once per round whatever the tracker
 * does, nothing for those with nothing to do; and how long a turn takes with
 * 30 goblins and 4 characters.
 */
if (Meteor.isServer) describe('Turn events in the initiative tracker', function () {
  this.timeout(30000);
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { passTurn } = require('/imports/api/creature/creatureFolders/server/turnEvents');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const [gmId, playerId, outsiderId] = [Random.id(), Random.id(), Random.id()];
  const [heroId, ogreId, goblinId, strangerId] = [Random.id(), Random.id(), Random.id(), Random.id()];
  const folderId = Random.id();
  const as = (method, args, userId = gmId) => method._execute({ userId }, { folderId, ...args });
  const tracker = async () => (await CreatureFolders.findOneAsync(folderId) as any).initiative;
  const entries = () => tracker().then(t => initiativeOrder(t.entries));
  // A creature's log entries, as the names of their lines shown
  const logs = async (creatureId: string) => (await CreatureLogs.find({ creatureId }, { sort: { date: 1 } }).fetchAsync())
    .map((log: any) => log.content.filter(line => !line.silenced).map(line => line.name));
  const damage = async (creatureId: string, variableName: string) =>
    (await CreatureProperties.findOneAsync({ 'root.id': creatureId, variableName }) as any)?.damage;

  const turnProps = (who: string, extra: ForestProp[] = []): ForestProp[] => [
    { type: 'trigger', name: `${who}'s turn starts`, event: 'turnStart' },
    { type: 'trigger', name: `${who}'s turn ends`, event: 'turnEnd' },
    ...extra,
  ];

  beforeEach(async function () {
    await removeAllCreaturesAndProps();
    await Promise.all([
      CreatureLogs.removeAsync({}),
      CreatureFolders.removeAsync(folderId),
      Meteor.users.removeAsync({ _id: { $in: [gmId, playerId, outsiderId] } }),
    ]);
    await Meteor.users.rawCollection().insertMany([gmId, playerId, outsiderId].map(_id => ({ _id, createdAt: new Date() })) as any[]);
    // A player's character, which its party's game master edits, as joining makes it
    await createTestCreature({
      _id: heroId, name: 'Hero', owner: playerId, type: 'pc',
      props: turnProps('Hero', [{
        type: 'attribute', name: 'Reaction', attributeType: 'resource', variableName: 'reaction',
        baseValue: { calculation: '1' }, damage: 1, reset: 'turnStart',
      }]),
    });
    await Creatures.updateAsync(heroId, { $set: { writers: [gmId] } });
    await createTestCreature({
      _id: ogreId, name: 'Ogre', owner: gmId, type: 'monster',
      props: turnProps('Ogre', [{
        type: 'attribute', name: 'Legendary Actions', attributeType: 'resource', variableName: 'legendaryActions',
        baseValue: { calculation: '3' }, damage: 2, reset: 'turnStart',
      }]),
    });
    await createTestCreature({ _id: goblinId, name: 'Goblin', owner: gmId, type: 'monster', props: [{ type: 'note', name: 'Nimble Escape' }] });
    // Someone else's character the game master put in the folder: that player never joined
    await createTestCreature({ _id: strangerId, name: 'Stranger', owner: outsiderId, type: 'pc', props: turnProps('Stranger') });
    await Creatures.updateAsync(strangerId, { $set: { writers: [gmId] } });
    await CreatureFolders.rawCollection().insertOne({
      _id: folderId, name: 'Table', owner: gmId, members: [playerId], creatures: [heroId, ogreId, goblinId, strangerId], order: 0,
      initiative: {
        round: 1,
        turn: 0,
        entries: [
          { _id: 'e-hero', creatureId: heroId, name: 'Hero', initiative: 20, bonus: 0 },
          { _id: 'e-ogre', creatureId: ogreId, name: 'Ogre', initiative: 15, bonus: 0 },
          // Added by hand: no creature, no event
          { _id: 'e-wolf', name: 'Wolf', initiative: 12, bonus: 0 },
          { _id: 'e-goblin', creatureId: goblinId, name: 'Goblin', initiative: 10, bonus: 0 },
          { _id: 'e-stranger', creatureId: strangerId, name: 'Stranger', initiative: 5, bonus: 0 },
        ],
      },
    } as any);
  });

  after(async function () {
    await removeAllCreaturesAndProps();
    await Promise.all([
      CreatureLogs.removeAsync({}),
      CreatureFolders.removeAsync(folderId),
      Meteor.users.removeAsync({ _id: { $in: [gmId, playerId, outsiderId] } }),
    ]);
  });

  it('Next: the turn that ends, then the turn that starts, each logged on its creature', async function () {
    await as(advanceInitiative, { step: 1 });
    assert.deepEqual(await logs(heroId), [['End of turn', 'Hero\'s turn ends']]);
    assert.deepEqual(await logs(ogreId), [['Start of turn', 'Ogre\'s turn starts']]);
    assert.equal(await damage(ogreId, 'legendaryActions'), 0);
    assert.equal(await damage(heroId, 'reaction'), 1, 'the hero\'s turn did not start');
    const [hero, ogre] = await entries();
    assert.equal(hero.endedRound, 1);
    assert.equal(ogre.startedRound, 1);
  });

  it('two Next at once on the same tracker: one move, one turn start', async function () {
    const folder = await CreatureFolders.findOneAsync(folderId);
    const moved = await Promise.all([advanceTracker(folder, 1), advanceTracker(folder, 1)]);
    assert.sameMembers(moved, [true, false]);
    assert.include(await tracker(), { round: 1, turn: 1 });
    assert.lengthOf(await logs(ogreId), 1);
    assert.lengthOf(await logs(heroId), 1);
  });

  it('the same turn passing twice at once (the board and Discord): each event once', async function () {
    const [hero, ogre] = await entries();
    const turnPass = { ended: { entry: hero, round: 1 }, started: { entry: ogre, round: 1 } };
    await Promise.all([passTurn(folderId, turnPass), passTurn(folderId, turnPass), passTurn(folderId, turnPass)]);
    assert.lengthOf(await logs(ogreId), 1);
    assert.lengthOf(await logs(heroId), 1);
  });

  it('Previous then Next starts and ends nothing a second time', async function () {
    await as(advanceInitiative, { step: 1 });
    // Spent again since: a second turn start would restore it
    await CreatureProperties.updateAsync({ 'root.id': ogreId, variableName: 'legendaryActions' }, { $set: { damage: 2 } }, { bypassCollection2: true });
    await as(advanceInitiative, { step: -1 });
    await as(advanceInitiative, { step: 1 });
    assert.include(await tracker(), { round: 1, turn: 1 });
    assert.lengthOf(await logs(ogreId), 1, 'its turn started once');
    assert.lengthOf(await logs(heroId), 1, 'the hero\'s turn ended once');
    assert.equal(await damage(ogreId, 'legendaryActions'), 2);
  });

  it('a full round: every turn of the party\'s creatures starts and ends once; nothing for the others', async function () {
    // Hero (ends), Ogre, Wolf, Goblin, Stranger, then round 2: Hero
    for (let i = 0; i < 5; i += 1) await as(advanceInitiative, { step: 1 });
    assert.include(await tracker(), { round: 2, turn: 0 });
    assert.deepEqual((await logs(heroId)).map(lines => lines[0]), ['End of turn', 'Start of turn']);
    assert.deepEqual((await logs(ogreId)).map(lines => lines[0]), ['Start of turn', 'End of turn']);
    assert.lengthOf(await logs(goblinId), 0, 'nothing to do');
    assert.lengthOf(await logs(strangerId), 0, 'not of the party');
    assert.equal(await damage(heroId, 'reaction'), 0, 'round 2: the hero\'s turn started');
    // Nothing written to the tracker for them either
    const marked = (await entries()).filter(entry => 'startedRound' in entry || 'endedRound' in entry).map(entry => entry.name);
    assert.sameMembers(marked, ['Hero', 'Ogre']);
  });

  it('the last turn of a round ends as the next round starts, once', async function () {
    // The ogre last: Hero, Wolf, Goblin, Stranger, Ogre
    await CreatureFolders.updateAsync({ _id: folderId, 'initiative.entries._id': 'e-ogre' } as any, {
      $set: { 'initiative.entries.$.initiative': 1, 'initiative.turn': 4 },
    });
    assert.equal((await entries())[4].name, 'Ogre');
    await as(advanceInitiative, { step: 1 });
    assert.include(await tracker(), { round: 2, turn: 0 });
    assert.deepEqual(await logs(ogreId), [['End of turn', 'Ogre\'s turn ends']]);
    assert.deepEqual(await logs(heroId), [['Start of turn', 'Hero\'s turn starts']]);
    // Back to round 1 and forward again: it ended once
    await as(advanceInitiative, { step: -1 });
    await as(advanceInitiative, { step: 1 });
    assert.lengthOf(await logs(ogreId), 1);
    assert.equal((await entries())[4].endedRound, 1);
  });

  it('keeps turning effects and triggers when the party does not count durations', async function () {
    await CreatureProperties.rawCollection().insertOne({
      _id: Random.id(), type: 'buff', name: 'Bless', duration: { calculation: '1' },
      root: { collection: 'creatures', id: ogreId }, left: 100, right: 101,
    } as any);
    await as(setTrackDurations, { trackDurations: false });
    await as(advanceInitiative, { step: 1 });
    assert.deepEqual((await logs(ogreId))[0], ['Start of turn', 'Ogre\'s turn starts']);
    assert.isNotTrue((await CreatureProperties.findOneAsync({ 'root.id': ogreId, name: 'Bless' }) as any)?.removed);
  });

  it('removing the creature whose turn it is starts the next one\'s; removing the last starts the next round', async function () {
    await as(removeInitiativeEntry, { entryId: 'e-hero' });
    assert.include(await tracker(), { round: 1, turn: 0 });
    assert.deepEqual((await logs(ogreId)).map(lines => lines[0]), ['Start of turn']);
    assert.lengthOf(await logs(heroId), 0, 'gone from the fight: its turn just stops');

    // The stranger's turn, the last of the round: gone, the next round starts with the ogre
    await CreatureFolders.updateAsync(folderId, { $set: { 'initiative.turn': 3 } });
    await as(removeInitiativeEntry, { entryId: 'e-stranger' });
    assert.include(await tracker(), { round: 2, turn: 0 });
    assert.deepEqual((await logs(ogreId)).map(lines => lines[0]), ['Start of turn', 'Start of turn']);
  });

  /*
   * Every way the creature whose turn it is leaves the tracker passes the turn
   * as the tracker's remove button does (removeFromTracker): its player
   * deletes it from its sheet, the game master deletes a monster from the
   * board's menu, "End the encounter" deletes the monsters while the fight
   * goes on, its player leaves the party. Ending the fight with them, or the
   * board's folder, or the game master's account, starts no turn.
   */
  describe('when the creature whose turn it is leaves the tracker', function () {
    const ENTRIES = {
      Hero: { _id: 'e-hero', creatureId: heroId },
      Ogre: { _id: 'e-ogre', creatureId: ogreId },
      Goblin: { _id: 'e-goblin', creatureId: goblinId },
      Stranger: { _id: 'e-stranger', creatureId: strangerId },
    };
    // A fight in this order (the wolf left out), at `active`'s turn of `round`
    async function fight(order: (keyof typeof ENTRIES)[], active: keyof typeof ENTRIES, round = 1) {
      await CreatureFolders.updateAsync(folderId, {
        $set: {
          initiative: {
            round,
            turn: order.indexOf(active),
            entries: order.map((name, i) => ({ ...ENTRIES[name], name, initiative: 20 - 5 * i, bonus: 0 })),
          },
        },
      });
    }
    const activeName = async () => {
      const { turn, entries: all } = await tracker();
      return initiativeOrder(all)[turn]?.name;
    };
    const firstLines = async (creatureId: string) => (await logs(creatureId)).map(lines => lines[0]);
    const deleteCreature = (charId: string, userId: string) =>
      (removeCreature as any)._execute({ userId, unblock() { /* as a method's */ } }, { charId });

    it('deleted from its sheet: the next creature\'s turn starts, once', async function () {
      await fight(['Hero', 'Ogre', 'Goblin', 'Stranger'], 'Hero');
      await deleteCreature(heroId, playerId);
      assert.include(await tracker(), { round: 1, turn: 0 });
      assert.equal(await activeName(), 'Ogre');
      assert.deepEqual(await logs(ogreId), [['Start of turn', 'Ogre\'s turn starts']]);
      assert.equal(await damage(ogreId, 'legendaryActions'), 0, 'what resets on its turn start did');
      assert.equal((await entries())[0].startedRound, 1, 'under the claim Next would take');
      // Next then ends the ogre's turn: its turn had started, once
      await as(advanceInitiative, { step: 1 });
      assert.deepEqual(await firstLines(ogreId), ['Start of turn', 'End of turn']);
    });

    it('the last of the round deleted from its sheet: the next round starts with the first', async function () {
      await fight(['Hero', 'Ogre', 'Goblin', 'Stranger'], 'Stranger');
      await deleteCreature(strangerId, outsiderId);
      assert.include(await tracker(), { round: 2, turn: 0 });
      assert.deepEqual(await firstLines(heroId), ['Start of turn']);
      assert.equal(await damage(heroId, 'reaction'), 0);
      assert.equal((await entries())[0].startedRound, 2);
    });

    it('a monster deleted from the board\'s menu: the same', async function () {
      await fight(['Ogre', 'Hero', 'Goblin', 'Stranger'], 'Ogre');
      // What the monster card's "Delete" calls (PartyMemberCard.vue)
      await deleteCreature(ogreId, gmId);
      assert.include(await tracker(), { round: 1, turn: 0 });
      assert.equal(await activeName(), 'Hero');
      assert.deepEqual(await logs(heroId), [['Start of turn', 'Hero\'s turn starts']]);
      assert.equal(await damage(heroId, 'reaction'), 0);
    });

    it('"End the encounter" on a monster\'s turn, the fight going on: the next creature that stays starts its turn, once', async function () {
      // The ogre's turn, the goblin next: both monsters go at once
      await fight(['Ogre', 'Goblin', 'Hero', 'Stranger'], 'Ogre');
      assert.equal(await as(endEncounter, {}), 2);
      assert.include(await tracker(), { round: 1, turn: 0 });
      assert.deepEqual((await entries()).map(entry => entry.name), ['Hero', 'Stranger']);
      assert.deepEqual(await logs(heroId), [['Start of turn', 'Hero\'s turn starts']]);
    });

    it('"End the encounter" on the last turns of the round: the next round starts, one turn start', async function () {
      await fight(['Hero', 'Stranger', 'Ogre', 'Goblin'], 'Ogre');
      await as(endEncounter, {});
      assert.include(await tracker(), { round: 2, turn: 0 });
      assert.deepEqual(await firstLines(heroId), ['Start of turn']);
    });

    it('"End the encounter" with the combat: the fight ends, no turn starts', async function () {
      await fight(['Ogre', 'Hero', 'Goblin', 'Stranger'], 'Ogre');
      await as(endEncounter, { endCombat: true });
      assert.notExists(await tracker());
      assert.lengthOf(await logs(heroId), 0);
    });

    it('its player leaves the party: the next creature\'s turn starts', async function () {
      await fight(['Hero', 'Ogre', 'Goblin', 'Stranger'], 'Hero');
      await as(leaveParty, {}, playerId);
      assert.equal(await activeName(), 'Ogre');
      assert.deepEqual(await firstLines(ogreId), ['Start of turn']);
      assert.lengthOf(await logs(heroId), 0, 'gone from the fight: its turn just stops');
    });

    it('the board\'s folder deleted on a monster\'s turn: the fight ends with it, no turn starts', async function () {
      await fight(['Ogre', 'Hero', 'Goblin', 'Stranger'], 'Ogre');
      await (removeCreatureFolder as any)._execute({ userId: gmId }, { _id: folderId });
      assert.notExists(await CreatureFolders.findOneAsync(folderId));
      assert.lengthOf(await logs(heroId), 0);
    });

    it('the game master\'s account deleted on a monster\'s turn: the fight ends with the board, no turn starts', async function () {
      await fight(['Ogre', 'Hero', 'Goblin', 'Stranger'], 'Ogre');
      await (Meteor.users as any).deleteMyAccount._execute({ userId: gmId, unblock() { /* as a method's */ } }, {});
      assert.notExists(await CreatureFolders.findOneAsync(folderId));
      assert.lengthOf(await logs(heroId), 0);
    });

    describe('while a Next click is in flight', function () {
      it('a Next that read the tracker before the deletion moves nothing: one turn start, the right creature\'s', async function () {
        await fight(['Hero', 'Ogre', 'Goblin', 'Stranger'], 'Hero');
        const read = await CreatureFolders.findOneAsync(folderId);
        await deleteCreature(heroId, playerId);
        assert.isFalse(await advanceTracker(read, 1), 'the turn passed with the deletion');
        assert.equal(await activeName(), 'Ogre');
        assert.lengthOf(await logs(ogreId), 1);
      });

      /**
       * Runs `meanwhile` once, right after removeFromTracker reads the
       * tracker, before it writes: what lands between the two
       */
      async function betweenReadAndWrite(meanwhile: () => Promise<unknown>, removal: () => Promise<unknown>) {
        const folders = CreatureFolders as any;
        const findOneAsync = folders.findOneAsync;
        const own = Object.hasOwn(folders, 'findOneAsync');
        let ran = false;
        folders.findOneAsync = async function (selector: unknown, options?: { fields?: Record<string, unknown> }) {
          const found = await findOneAsync.call(this, selector, options);
          // The tracker's read in removeFromTracker
          if (!ran && options?.fields?.initiative) {
            ran = true;
            await meanwhile();
          }
          return found;
        };
        try {
          await removal();
        } finally {
          if (own) folders.findOneAsync = findOneAsync;
          else delete folders.findOneAsync;
        }
        assert.isTrue(ran, 'the removal read the tracker');
      }

      it('a Next written between the deletion\'s read and its write: the deletion reads again, the turn stays where Next put it', async function () {
        await fight(['Hero', 'Ogre', 'Goblin', 'Stranger'], 'Hero');
        await betweenReadAndWrite(
          async () => assert.isTrue(await advanceTracker(await CreatureFolders.findOneAsync(folderId), 1)),
          // The stranger, not whose turn it is
          () => deleteCreature(strangerId, outsiderId),
        );
        assert.include(await tracker(), { round: 1, turn: 1 });
        assert.equal(await activeName(), 'Ogre', 'not the hero\'s again');
        assert.deepEqual(await firstLines(heroId), ['End of turn']);
        assert.deepEqual(await firstLines(ogreId), ['Start of turn']);
      });

      it('a turn\'s mark written between the deletion\'s read and its write stays: that turn never starts twice', async function () {
        await fight(['Hero', 'Ogre', 'Goblin', 'Stranger'], 'Ogre');
        // The ogre's turn started (a Next whose claim lands late)
        const claimOgre = () => CreatureFolders.updateAsync({ _id: folderId, 'initiative.entries._id': 'e-ogre' } as any, {
          $set: { 'initiative.entries.$.startedRound': 1 },
        });
        await betweenReadAndWrite(claimOgre, () => deleteCreature(strangerId, outsiderId));
        assert.equal((await entries()).find(entry => entry.name === 'Ogre').startedRound, 1);
        // Previous then Next: the ogre's turn does not start again
        await as(advanceInitiative, { step: -1 });
        await as(advanceInitiative, { step: 1 });
        assert.lengthOf(await logs(ogreId), 0);
      });

      it('the deletion and Next at once: one turn start, the right creature\'s', async function () {
        await fight(['Hero', 'Ogre', 'Goblin', 'Stranger'], 'Hero');
        const read = await CreatureFolders.findOneAsync(folderId);
        await Promise.all([deleteCreature(heroId, playerId), advanceTracker(read, 1)]);
        assert.equal(await activeName(), 'Ogre');
        assert.deepEqual(await firstLines(ogreId), ['Start of turn']);
      });
    });
  });

  it('rolling initiative starts round 1 with its first turn, again on a new roll', async function () {
    await CreatureFolders.updateAsync(folderId, { $set: { creatures: [ogreId] }, $unset: { initiative: 1 } });
    await as(rollInitiative, {});
    assert.include(await tracker(), { round: 1, turn: 0 });
    assert.equal((await entries())[0].startedRound, 1);
    assert.lengthOf(await logs(ogreId), 1);
    // A fight rolled again: round 1 again, its first turn again (accepted)
    await as(rollInitiative, {});
    assert.lengthOf(await logs(ogreId), 2);
  });

  it('measures a full round with 30 goblins and 4 characters: the time each Next takes', async function () {
    this.timeout(300000);
    // A goblin of the SRD 5.1 bestiary: 38 properties, nothing on a turn
    const goblinProps = (): ForestProp[] => [
      ...['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].map(variableName => ({
        type: 'attribute' as const, attributeType: 'ability' as const, name: variableName, variableName, baseValue: { calculation: '10' },
      })),
      { type: 'attribute', attributeType: 'healthBar', name: 'Hit Points', variableName: 'hitPoints', baseValue: { calculation: '7' }, reset: 'longRest' },
      ...['armor', 'speed', 'proficiencyBonus', 'creatureSize', 'darkvision', 'hitDice', 'tempHP', 'challengeRating'].map(variableName => ({
        type: 'attribute' as const, attributeType: 'stat' as const, name: variableName, variableName, baseValue: { calculation: '2' },
      })),
      ...['strengthSave', 'dexteritySave', 'constitutionSave', 'intelligenceSave', 'wisdomSave', 'charismaSave', 'initiative', 'perception', 'stealth']
        .map(variableName => ({ type: 'skill' as const, skillType: 'save' as const, name: variableName, variableName, ability: 'dexterity' })),
      { type: 'effect', operation: 'add', name: 'Stat block adjustment', stats: ['stealth'], amount: { calculation: '4' } },
      { type: 'constant', name: 'Creature type', variableName: 'creatureType', calculation: '"humanoid"' },
      { type: 'constant', name: 'Challenge', variableName: 'challenge', calculation: '0.25' },
      { type: 'note', name: 'Lore' },
      { type: 'feature', name: 'Nimble Escape' },
      ...['Scimitar', 'Shortbow'].map(name => ({
        type: 'action' as const, name, attackRoll: { calculation: 'dexterity.modifier + proficiencyBonus' },
        children: [{
          type: 'branch' as const, branchType: 'hit' as const,
          children: [{ type: 'damage' as const, amount: { calculation: '1d6 + 2' }, damageType: 'slashing' }],
        }],
      })),
      { type: 'folder', name: 'Actions' },
      { type: 'folder', name: 'Stats' },
      { type: 'folder', name: 'Skills' },
    ];
    // A player's character: around 150 properties, an effect that lasts a
    // minute, a trigger at the start and at the end of each turn, a reaction
    // back at the start of each turn
    const characterProps = (name: string): ForestProp[] => [
      ...goblinProps(),
      ...Array.from({ length: 110 }, (_, i): ForestProp => ({
        type: 'attribute', attributeType: 'stat', name: `${name} stat ${i}`, variableName: `stat${i}`, baseValue: { calculation: `${i} + strength` },
      })),
      { type: 'buff', name: 'Bless', duration: { calculation: '1 minute' } },
      { type: 'attribute', attributeType: 'resource', name: 'Reaction', variableName: 'reaction', baseValue: { calculation: '1' }, damage: 1, reset: 'turnStart' },
      { type: 'trigger', name: 'Concentration reminder', event: 'turnStart' },
      { type: 'trigger', name: 'Repeat the save', event: 'turnEnd', children: [{ type: 'roll', name: 'Save', roll: { calculation: '1d20 + 3' } }] },
    ];
    // Monsters as the board leaves them: not loaded by any sheet. The
    // characters as their players' open sheets leave them: loaded
    async function insertCreature(_id: string, name: string, owner: string, type: string, props: ForestProp[]) {
      await Creatures.insertAsync({ _id, name, owner, type, writers: [gmId], dirty: true } as any);
      await CreatureProperties.rawCollection().insertMany(propsFromForest(props, _id) as any[]);
      await computeCreature(_id);
    }
    const goblinIds = Array.from({ length: 30 }, () => Random.id());
    for (const [i, id] of goblinIds.entries()) await insertCreature(id, `Goblin ${i + 1}`, gmId, 'monster', goblinProps());
    const characterIds = Array.from({ length: 4 }, () => Random.id());
    for (const [i, id] of characterIds.entries()) {
      await createTestCreature({ _id: id, name: `Hero ${i + 1}`, owner: playerId, type: 'pc', props: characterProps(`Hero ${i + 1}`) });
    }
    const all = [...characterIds, ...goblinIds];
    await CreatureFolders.updateAsync(folderId, {
      $set: {
        creatures: all,
        initiative: {
          round: 0, turn: 0,
          entries: all.map((creatureId, i) => ({ _id: `m${i}`, creatureId, name: `C${i}`, initiative: 50 - i, bonus: 0 })),
        },
      },
    });
    const times: { ms: number, character: boolean }[] = [];
    const order = (await entries()).map(entry => entry.creatureId);
    // Two rounds: the first starts every turn, the second ends and starts them
    for (let i = 0; i < 2 * all.length; i += 1) {
      const start = process.hrtime.bigint();
      await as(advanceInitiative, { step: 1 });
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const { turn } = await tracker();
      // The turn of a character that starts, or ends (the one before)
      const before = order[(turn + all.length - 1) % all.length];
      times.push({ ms, character: characterIds.includes(order[turn]) || (i > 0 && characterIds.includes(before)) });
    }
    const sorted = (list: number[]) => [...list].sort((a, b) => a - b);
    const stats = (list: number[]) => {
      const s = sorted(list);
      const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
      return { n: s.length, median: at(0.5).toFixed(1), p95: at(0.95).toFixed(1), max: s[s.length - 1].toFixed(1) };
    };
    const goblinTimes = times.filter(t => !t.character).map(t => t.ms);
    const characterTimes = times.filter(t => t.character).map(t => t.ms);
    const total = times.reduce((sum, t) => sum + t.ms, 0);
    console.log('[turn events] 30 goblins + 4 characters, 2 rounds of Next (ms):', JSON.stringify({
      all: stats(times.map(t => t.ms)), goblinsOnly: stats(goblinTimes), withACharacter: stats(characterTimes),
      roundMs: (total / 2).toFixed(0),
    }));
    assert.lengthOf(await CreatureLogs.find({ creatureId: { $in: goblinIds } }).fetchAsync(), 0, 'the goblins log nothing');
    // Each character: its turn started and ended in each round
    for (const id of characterIds) {
      assert.deepEqual((await logs(id)).map(lines => lines[0]), ['Start of turn', 'End of turn', 'Start of turn', 'End of turn']);
    }
    assert.isBelow(Number(stats(goblinTimes).median), 250, 'a goblin\'s turn costs next to nothing');
    assert.isBelow(Number(stats(times.map(t => t.ms)).max), 5000);
  });
});
