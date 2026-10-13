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
