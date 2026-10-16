import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import initiativeOrder from '/imports/api/creature/creatureFolders/initiativeOrder';
import {
  advanceInitiative, advanceTracker, endInitiative, removeInitiativeEntry,
} from '/imports/api/creature/creatureFolders/methods/initiativeMethods';
import { leaveParty } from '/imports/api/creature/creatureFolders/methods/partyMethods';
import removeCreature from '/imports/api/creature/creatures/methods/removeCreature';
import setBuffDuration from '/imports/api/creature/creatureProperties/methods/setBuffDuration';
import { createTestCreature, removeAllCreaturesAndProps } from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import type { ForestProp } from '/imports/api/engine/computation/utility/propsFromForest.testFn';
import { loadedCreatures, reloadCachedProperties } from '/imports/api/engine/loadCreatures';
import { translateLogLine } from '/imports/api/creature/log/logMessages';
import { translatorFor } from '/imports/api/creature/log/discord/discordMessages';

/*
 * Effect durations anchored on the turns of the creature that applied them,
 * or on the end of a turn (phase 3.5 of the monsters): a goblin's "until the
 * start of its next turn" on a character ends when the goblin's turn starts,
 * not the character's; Guiding Bolt's "until the end of your next turn" on
 * the goblin ends at the end of the caster's next turn, not the one it was
 * cast in. Each once, whatever the tracker does; nothing for a creature with
 * nothing to do; and the effects whose source has no turns any more follow
 * their holder's.
 */
if (Meteor.isServer) describe('Effect durations anchored on a creature\'s turns', function () {
  this.timeout(30000);
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { passTurn } = require('/imports/api/creature/creatureFolders/server/turnEvents');
  const { hasTurnEventWork, turnEventWorkSelector } = require('/imports/api/engine/action/server/runTurnEvent');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const [gmId, playerId, outsiderId] = [Random.id(), Random.id(), Random.id()];
  const [heroId, goblinId, ogreId, strangerId] = [Random.id(), Random.id(), Random.id(), Random.id()];
  const folderId = Random.id();
  const as = (method, args, userId = gmId) => method._execute({ userId }, { folderId, ...args });
  const next = () => as(advanceInitiative, { step: 1 });
  const tracker = async () => (await CreatureFolders.findOneAsync(folderId) as any).initiative;
  const entry = async (name: string) => initiativeOrder((await tracker()).entries).find(e => e.name === name);
  const buff = async (creatureId: string, name: string) =>
    CreatureProperties.findOneAsync({ 'root.id': creatureId, name }) as Promise<any>;
  // A creature's log entries, oldest first
  const entries = (creatureId: string) => CreatureLogs.find({ creatureId }, { sort: { date: 1 } }).fetchAsync() as Promise<any[]>;
  // ... as the names of the lines they show
  const logs = async (creatureId: string) => (await entries(creatureId))
    .map(log => log.content.filter(line => !line.silenced).map(line => line.name));
  const ref = (id: string, name: string) => ({ id, name, collection: 'creatures' });

  // An effect on its holder that the goblin applied, counted on the goblin's turns
  const fromGoblin = (name: string, rounds: number, extra: ForestProp = { type: 'buff' }): ForestProp => ({
    ...extra, type: 'buff', name, duration: { calculation: String(rounds) },
    durationAnchor: 'source', appliedBy: ref(goblinId, 'Goblin'),
  } as ForestProp);

  /**
   * The table: the GM's goblin and ogre, a player's character (Lyra), and a
   * character of someone outside the party, in the tracker at `turn` of
   * `round`: Lyra (20), Goblin (15), Ogre (10), Stranger (5). None has
   * anything to do on a turn but the effects each test gives it
   */
  async function table({
    hero = [], goblin = [], ogre = [], stranger = [], round = 1, turn = 0, started = undefined,
  }: { hero?: ForestProp[], goblin?: ForestProp[], ogre?: ForestProp[], stranger?: ForestProp[], round?: number, turn?: number, started?: string } = {}) {
    await createTestCreature({ _id: heroId, name: 'Lyra', owner: playerId, type: 'pc', writers: [gmId], props: [{ type: 'note', name: 'Lyra' }, ...hero] });
    await createTestCreature({ _id: goblinId, name: 'Goblin', owner: gmId, type: 'monster', props: [{ type: 'note', name: 'Goblin' }, ...goblin] });
    await createTestCreature({ _id: ogreId, name: 'Ogre', owner: gmId, type: 'monster', props: [{ type: 'note', name: 'Ogre' }, ...ogre] });
    await createTestCreature({ _id: strangerId, name: 'Stranger', owner: outsiderId, type: 'pc', writers: [gmId], props: [{ type: 'note', name: 'Stranger' }, ...stranger] });
    const mark = (id: string) => (started === id ? { startedRound: round } : {});
    await CreatureFolders.rawCollection().insertOne({
      _id: folderId, name: 'Table', owner: gmId, members: [playerId], creatures: [heroId, goblinId, ogreId, strangerId], order: 0,
      initiative: {
        round, turn,
        entries: [
          { _id: 'e-hero', creatureId: heroId, name: 'Lyra', initiative: 20, bonus: 0, ...mark(heroId) },
          { _id: 'e-goblin', creatureId: goblinId, name: 'Goblin', initiative: 15, bonus: 0, ...mark(goblinId) },
          { _id: 'e-ogre', creatureId: ogreId, name: 'Ogre', initiative: 10, bonus: 0, ...mark(ogreId) },
          { _id: 'e-stranger', creatureId: strangerId, name: 'Stranger', initiative: 5, bonus: 0, ...mark(strangerId) },
        ],
      },
    } as any);
  }

  async function clear() {
    await removeAllCreaturesAndProps();
    await Promise.all([
      CreatureLogs.removeAsync({}),
      CreatureFolders.removeAsync(folderId),
      Meteor.users.removeAsync({ _id: { $in: [gmId, playerId, outsiderId] } }),
    ]);
  }

  beforeEach(async function () {
    await clear();
    await Meteor.users.rawCollection().insertMany([gmId, playerId, outsiderId].map(_id => ({ _id, createdAt: new Date() })) as any[]);
  });

  after(clear);

  it('a goblin\'s "until the start of its next turn" on a character ends as the goblin\'s turn starts, not hers, in her log', async function () {
    await table({ hero: [fromGoblin('Frightened', 1)], round: 1, turn: 3 });
    // Round 2: Lyra's turn starts, the effect is the goblin's to count
    await next();
    assert.include(await tracker(), { round: 2, turn: 0 });
    assert.isNotTrue((await buff(heroId, 'Frightened')).removed, 'her own turn does not end it');
    assert.isUndefined((await buff(heroId, 'Frightened')).durationSpent);
    assert.lengthOf(await entries(heroId), 0);
    assert.notProperty(await entry('Lyra'), 'startedRound', 'nothing of her own to do: no mark, no pass');

    // The goblin's turn starts: it ends, in her log, under the goblin's turn
    await next();
    assert.isTrue((await buff(heroId, 'Frightened')).removed);
    assert.deepEqual(await logs(heroId), [['Start of Goblin\'s turn', 'Frightened']]);
    const [log] = await entries(heroId);
    assert.deepEqual(log.content[0].i18n, { name: { key: 'logs.turnStartOf', params: { name: 'Goblin' } } });
    assert.equal(translateLogLine(log.content[0], translatorFor('fr')).name, 'Début du tour de Goblin');
    assert.equal(log.content[1].value, 'Ended: its duration ran out');
    assert.lengthOf(await entries(goblinId), 0, 'the goblin\'s log says nothing of her');
    assert.equal((await entry('Goblin')).startedRound, 2, 'the goblin\'s turn started once, with work: its mark');
  });

  it('Guiding Bolt\'s "until the end of your next turn", cast in the caster\'s turn, ends at the end of her next turn, in the goblin\'s log', async function () {
    // Cast on the goblin during Lyra's turn of round 1
    await table({
      goblin: [{
        type: 'buff', name: 'Guiding Bolt', duration: { calculation: '1' }, durationAnchor: 'source', durationEvent: 'turnEnd',
        appliedBy: ref(heroId, 'Lyra'),
      } as ForestProp],
      round: 1, turn: 0, started: heroId,
    });
    // Her turn ends: the turn it was cast in is not her next one; the goblin's own turn counts nothing of it
    await next();
    let bolt = await buff(goblinId, 'Guiding Bolt');
    assert.isNotTrue(bolt.removed, 'not at the end of the turn it was cast in');
    assert.isUndefined(bolt.durationSpent);
    assert.notProperty(await entry('Goblin'), 'startedRound', 'the goblin\'s turn has nothing to do');
    // Her next turn starts (round 2): it starts counting, silently
    await next();
    await next();
    await next();
    assert.include(await tracker(), { round: 2, turn: 0 });
    bolt = await buff(goblinId, 'Guiding Bolt');
    assert.isNotTrue(bolt.removed);
    assert.equal(bolt.durationSpent, 0);
    assert.lengthOf(await entries(goblinId), 0, 'nothing to show');
    // Her next turn ends: so does it, in the goblin's log, its game master's
    await next();
    assert.isTrue((await buff(goblinId, 'Guiding Bolt')).removed);
    assert.deepEqual(await logs(goblinId), [['End of Lyra\'s turn', 'Guiding Bolt']]);
    assert.lengthOf(await entries(heroId), 0, 'nothing in hers');
  });

  it('the board\'s "until the end of its next turn" set during its turn ends at the end of its next; "until the start" at the next start', async function () {
    await table({ hero: [{ type: 'buff', name: 'Dodge' }, { type: 'buff', name: 'Shove' }], round: 1, turn: 3 });
    // Round 2, Lyra's turn: the game master sets both on her
    await next();
    const setDuration = (args: object) => (setBuffDuration as any)._execute({ userId: gmId }, args);
    await setDuration({ _id: (await buff(heroId, 'Dodge'))._id, rounds: 1, event: 'turnEnd' });
    await setDuration({ _id: (await buff(heroId, 'Shove'))._id, rounds: 1 });
    await reloadCachedProperties(heroId);
    const dodge = await buff(heroId, 'Dodge');
    assert.equal(dodge.durationEvent, 'turnEnd');
    assert.equal(dodge.duration?.calculation, '1');
    // This turn's end is not its next one
    await next();
    assert.isNotTrue((await buff(heroId, 'Dodge')).removed);
    assert.isNotTrue((await buff(heroId, 'Shove')).removed);
    // Round 3: her turn starts, Shove ends; her turn ends, Dodge does
    await next();
    await next();
    await next();
    assert.isTrue((await buff(heroId, 'Shove')).removed);
    assert.isNotTrue((await buff(heroId, 'Dodge')).removed);
    await next();
    assert.isTrue((await buff(heroId, 'Dodge')).removed);
    assert.deepEqual(await logs(heroId), [['Start of turn', 'Shove'], ['End of turn', 'Dodge']]);

    // Set during the goblin's turn (round 3, now): her coming turn is her next one
    await CreatureProperties.insertAsync({
      _id: Random.id(), type: 'buff', name: 'Parry', root: { collection: 'creatures', id: heroId }, left: 100, right: 101,
      duration: { calculation: '1' }, durationEvent: 'turnEnd',
    } as any);
    await reloadCachedProperties(heroId);
    for (let i = 0; i < 3; i += 1) await next();
    assert.isNotTrue((await buff(heroId, 'Parry')).removed, 'round 4, her turn has started');
    await next();
    assert.isTrue((await buff(heroId, 'Parry')).removed, 'and ended');
  });

  it('counts down once, whatever the tracker does: the same turn passing three times at once, Previous then Next', async function () {
    await table({ hero: [fromGoblin('Frightened', 2)], round: 1, turn: 0 });
    const [hero, goblin] = initiativeOrder((await tracker()).entries);
    const turnPass = { ended: { entry: hero, round: 1 }, started: { entry: goblin, round: 1 } };
    await Promise.all([passTurn(folderId, turnPass), passTurn(folderId, turnPass), passTurn(folderId, turnPass)]);
    assert.equal((await buff(heroId, 'Frightened')).durationSpent, 1, 'once');

    // Through the tracker: to the goblin's turn, back, then forward again
    await CreatureFolders.updateAsync(folderId, { $set: { 'initiative.turn': 1 } });
    const folder = await CreatureFolders.findOneAsync(folderId);
    await advanceTracker(folder, -1);
    await advanceTracker(await CreatureFolders.findOneAsync(folderId), 1);
    assert.include(await tracker(), { round: 1, turn: 1 });
    assert.equal((await buff(heroId, 'Frightened')).durationSpent, 1, 'still once');
    assert.isNotTrue((await buff(heroId, 'Frightened')).removed);
  });

  it('asks one query of a creature with nothing to do, an indexed one; finds the effects anchored on its turns', async function () {
    await table({
      hero: [
        // Anchored on the ogre's turns: the ogre's work at the start of a turn, never hers
        { ...fromGoblin('Restrained', 2), appliedBy: ref(ogreId, 'Ogre') } as ForestProp,
        // Anchored on the end of the goblin's turns, counting already
        { ...fromGoblin('Grappled', 2), durationEvent: 'turnEnd', durationSpent: 0 } as ForestProp,
      ],
    });
    const party = { holderIds: [heroId, goblinId, ogreId], sourcesWithTurns: [heroId, goblinId, ogreId] };
    assert.isTrue(await hasTurnEventWork(ogreId, 'turnStart', party), 'the ogre\'s turn start counts Restrained down');
    assert.isFalse(await hasTurnEventWork(ogreId, 'turnEnd', party));
    assert.isTrue(await hasTurnEventWork(goblinId, 'turnEnd', party), 'the goblin\'s turn end counts Grappled down');
    assert.isFalse(await hasTurnEventWork(goblinId, 'turnStart', party));
    assert.isFalse(await hasTurnEventWork(heroId, 'turnStart', party), 'both are counted on other creatures\' turns');
    assert.isFalse(await hasTurnEventWork(heroId, 'turnEnd', party));
    // Lyra out of the party's creatures: their turns leave her effects alone
    assert.isFalse(await hasTurnEventWork(ogreId, 'turnStart', { ...party, holderIds: [goblinId, ogreId] }));
    // The ogre without turns in the fight: Restrained follows hers
    assert.isTrue(await hasTurnEventWork(heroId, 'turnStart', { ...party, sourcesWithTurns: [heroId, goblinId] }));
    // Effects not counted: no turn of anyone's counts them
    assert.isFalse(await hasTurnEventWork(ogreId, 'turnStart', { ...party, countDurations: false }));

    // The query reads indexes, never the whole collection
    const plan = await CreatureProperties.rawCollection().find(turnEventWorkSelector(ogreId, 'turnStart', party))
      .explain('queryPlanner');
    const stages = JSON.stringify(plan.queryPlanner.winningPlan);
    assert.notInclude(stages, 'COLLSCAN', stages);
    assert.include(stages, 'IXSCAN');
    const index = (await CreatureProperties.rawCollection().indexes()).find(i => i.key?.['appliedBy.id'] === 1);
    assert.exists(index, 'an index on appliedBy.id');
    assert.isTrue(index?.sparse, 'sparse: only effects another creature applied have it');
  });

  it('counts them down on a turn of the source run alone, outside a tracker (runTurnEvent)', async function () {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: runTurnEvent } = require('/imports/api/engine/action/server/runTurnEvent');
    await table({ hero: [fromGoblin('Frightened', 1)] });
    assert.equal(await runTurnEvent(goblinId, 'turnStart', { holderIds: [heroId, goblinId] }), 'nothing',
      'nothing of its own to do');
    assert.isTrue((await buff(heroId, 'Frightened')).removed, 'the goblin\'s turn: it has turns');
    assert.deepEqual(await logs(heroId), [['Start of Goblin\'s turn', 'Frightened']]);
  });

  it('counts from the rounds as stored, not as the loaded creature\'s cache still holds them', async function () {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: runTurnEvent } = require('/imports/api/engine/action/server/runTurnEvent');
    await table({ hero: [{ type: 'buff', name: 'Bless', duration: { calculation: '2' } }] });
    const bless = await buff(heroId, 'Bless');
    // A round spent, stored; the cache's observer has not applied it yet
    await CreatureProperties.rawCollection().updateOne({ _id: bless._id }, { $set: { durationSpent: 1 } });
    const cached = () => loadedCreatures.get(heroId)?.properties.get(bless._id) as any;
    for (let i = 0; i < 100 && cached()?.durationSpent !== 1; i += 1) await new Promise(resolve => setTimeout(resolve, 20));
    cached().durationSpent = undefined;
    assert.equal(await runTurnEvent(heroId, 'turnStart'), 'logged');
    assert.isTrue((await buff(heroId, 'Bless')).removed, 'its second round spent');
  });

  describe('when the source has no turns any more, or the holder leaves', function () {
    it('the source taken out of the tracker: its effects follow their holder\'s turns', async function () {
      await table({ hero: [fromGoblin('Frightened', 2)], round: 1, turn: 3 });
      // Round 2: not on her turn; on the goblin's
      await next();
      assert.isUndefined((await buff(heroId, 'Frightened')).durationSpent);
      await next();
      assert.equal((await buff(heroId, 'Frightened')).durationSpent, 1);
      // The goblin leaves the fight: her next turn counts it, and ends it
      await as(removeInitiativeEntry, { entryId: 'e-goblin' });
      assert.include(await tracker(), { round: 2, turn: 1 }, 'the ogre\'s turn');
      await next();
      await next();
      assert.include(await tracker(), { round: 3, turn: 0 });
      assert.isTrue((await buff(heroId, 'Frightened')).removed);
      assert.deepEqual((await logs(heroId)).at(-1), ['Start of turn', 'Frightened'], 'her own turn, her own title');
    });

    it('the source deleted: the same', async function () {
      await table({ hero: [fromGoblin('Frightened', 2)], round: 1, turn: 3 });
      // Round 2: not on her turn; on the goblin's
      await next();
      assert.isUndefined((await buff(heroId, 'Frightened')).durationSpent);
      await next();
      assert.equal((await buff(heroId, 'Frightened')).durationSpent, 1);
      // The game master deletes the goblin: out of the board and the tracker
      await (removeCreature as any)._execute({ userId: gmId, unblock() { /* as a method's */ } }, { charId: goblinId });
      assert.notInclude((await tracker()).entries.map(e => e.creatureId), goblinId);
      // The ogre's turn, the stranger's, then round 3: her turn ends it
      await next();
      await next();
      assert.include(await tracker(), { round: 3, turn: 0 });
      assert.isTrue((await buff(heroId, 'Frightened')).removed);
    });

    it('the holder leaves the board: the source\'s turns no longer count its effects', async function () {
      await table({ hero: [fromGoblin('Frightened', 3)], round: 1, turn: 0, started: heroId });
      await next();
      assert.equal((await buff(heroId, 'Frightened')).durationSpent, 1, 'the goblin\'s turn counted it');
      // Lyra's player leaves the party with her
      await (leaveParty as any)._execute({ userId: playerId }, { folderId });
      for (let i = 0; i < 3; i += 1) await next();
      assert.include(await tracker(), { round: 2, turn: 0 }, 'the goblin\'s turn again');
      assert.equal((await buff(heroId, 'Frightened')).durationSpent, 1, 'not counted: she is not at this table any more');
      assert.isNotTrue((await buff(heroId, 'Frightened')).removed);
    });

    it('the fight ends: effects keep the rounds they have left, and in the next fight follow their holder while the source is not in it', async function () {
      await table({ hero: [fromGoblin('Frightened', 2)], round: 1, turn: 0, started: heroId });
      await next();
      assert.equal((await buff(heroId, 'Frightened')).durationSpent, 1);
      await as(endInitiative, {});
      const frightened = await buff(heroId, 'Frightened');
      assert.isNotTrue(frightened.removed, 'still on her');
      assert.equal(frightened.durationSpent, 1, 'a round left');
      // The next fight, without the goblin: her turn ends it
      await CreatureFolders.updateAsync(folderId, {
        $set: {
          initiative: {
            round: 1, turn: 1,
            entries: [
              { _id: 'f-hero', creatureId: heroId, name: 'Lyra', initiative: 18, bonus: 0 },
              { _id: 'f-ogre', creatureId: ogreId, name: 'Ogre', initiative: 12, bonus: 0 },
            ],
          },
        },
      });
      await next();
      assert.isTrue((await buff(heroId, 'Frightened')).removed);
    });

    it('a character of someone outside the party: its effects are never counted on the party\'s turns, nor do its turns count theirs', async function () {
      await table({
        stranger: [fromGoblin('Frightened', 1)],
        // Applied by the stranger, whose turns the server never runs: hers count it
        hero: [{ ...fromGoblin('Restrained', 1), appliedBy: ref(strangerId, 'Stranger') } as ForestProp],
        round: 1, turn: 3,
      });
      // Round 2: her turn ends Restrained
      await next();
      assert.isTrue((await buff(heroId, 'Restrained')).removed);
      // The goblin's turn leaves the stranger's Frightened alone
      await next();
      assert.include(await tracker(), { round: 2, turn: 1 }, 'the goblin\'s turn');
      const frightened = await buff(strangerId, 'Frightened');
      assert.isNotTrue(frightened.removed);
      assert.isUndefined(frightened.durationSpent);
      assert.lengthOf(await entries(strangerId), 0);
    });
  });
});

/*
 * What a player receives when a monster's effect on their character ends on
 * the monster's turn: their character's log gets the effect's end, under
 * the monster's turn, by its name alone, which the board shows them anyway;
 * nothing of the monster's turn itself (its triggers, its own effects, what
 * resets), nothing of its stats; the party's Discord channel gets her entry
 * once, never the monster's. The goblin's distinctive values are those of
 * the phase 2.3 canaries (monsterTargeting.test.ts): armor class 271828, hit
 * points 314159, and names starting with SECRET.
 */
if (Meteor.isServer) describe('A monster\'s effect on a character ending on the monster\'s turn: what the player receives', function () {
  this.timeout(60000);
  /* eslint-disable @typescript-eslint/no-require-imports */
  // Unit tests load no entry point: the publications and the methods register here
  require('/imports/api/creature/creatureFolders/server/publications/partyBoard');
  require('/imports/api/creature/creatures/server/publications/singleCharacter');
  require('/imports/startup/server/publicationStrategies');
  require('/imports/api/creature/creatureFolders/methods/index');
  const { openAs } = require('/imports/api/utility/ddpClient.testFn');
  const { fakeDiscord } = require('/imports/api/creature/log/server/fakeDiscord.testFn');
  const {
    createWebhookSender, discordIntakeIdle, forgetWebhook, setWebhookSender,
  } = require('/imports/api/creature/log/server/discordWebhooks');
  const { setPartyWebhook } = require('/imports/api/creature/creatureFolders/methods/discordMethods');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const [gmId, playerId] = [Random.id(), Random.id()];
  const [lyraId, goblinId] = [Random.id(), Random.id()];
  const folderId = Random.id();
  const PARTY = { id: '1100000000000000035', token: 'anchored-token' };
  const CANARIES = ['27182', '31415', 'SECRET'];
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const withoutDates = (value: unknown) => JSON.stringify(value ?? null).replace(/\{"\$date":\d+\}/g, '{}');
  let player: any;
  let fake: any;
  let sender: any;
  let previous: any;
  let seen = 0;

  before(async function () {
    await removeAllCreaturesAndProps();
    await Meteor.users.rawCollection().insertMany([gmId, playerId].map((_id, i) => ({
      _id, createdAt: new Date(), username: `anchored-${i}-${_id}`,
    })) as any[]);
    // Frightened "until the end of its next turn", applied during the goblin's
    // previous turn: its turn has started since, so this end is the one
    await createTestCreature({
      _id: lyraId, name: 'Lyra', owner: playerId, type: 'pc', writers: [gmId],
      props: [{
        type: 'buff', name: 'Frightened', tags: ['condition'], duration: { calculation: '1' },
        durationAnchor: 'source', durationEvent: 'turnEnd', durationSpent: 0,
        appliedBy: { id: goblinId, name: 'Goblin 2', collection: 'creatures' },
      } as ForestProp,
      // Her own turn's end, which the goblin's does not bring
      { type: 'trigger', name: 'Bardic reminder', event: 'turnEnd' }],
    });
    await createTestCreature({
      _id: goblinId, name: 'Goblin 2', owner: gmId, type: 'monster',
      props: [
        { type: 'attribute', attributeType: 'healthBar', name: 'Hit Points', variableName: 'hitPoints', baseValue: { calculation: '314159' } },
        { type: 'attribute', attributeType: 'stat', name: 'Armor Class', variableName: 'armor', baseValue: { calculation: '271828' } },
        // Its own turn's end: a trigger, a resource back, its own effect ending
        { type: 'trigger', name: 'SECRET-LAIR', event: 'turnEnd', description: { text: 'SECRET-LAIR at {hitPoints.total}' } },
        {
          type: 'attribute', attributeType: 'resource', name: 'SECRET-REACTION', variableName: 'secretReaction',
          baseValue: { calculation: '1' }, damage: 1, reset: 'turnEnd',
        },
        { type: 'buff', name: 'SECRET-SEAL', duration: { calculation: '1' }, durationEvent: 'turnEnd', durationSpent: 0 } as ForestProp,
      ],
    });
    await CreatureFolders.rawCollection().insertOne({
      _id: folderId, name: 'The table', owner: gmId, members: [playerId], creatures: [lyraId, goblinId], order: 0,
      initiative: {
        round: 1, turn: 1,
        entries: [
          { _id: 'a-lyra', creatureId: lyraId, name: 'Lyra', initiative: 20, bonus: 0, startedRound: 1, endedRound: 1 },
          { _id: 'a-goblin', creatureId: goblinId, name: 'Goblin 2', initiative: 15, bonus: 0, startedRound: 1 },
        ],
      },
    } as any);
    fake = await fakeDiscord();
    sender = createWebhookSender({ baseUrl: fake.baseUrl, onGone: forgetWebhook });
    previous = setWebhookSender(sender);
    await (setPartyWebhook as any)._execute({ userId: gmId }, {
      folderId, webhook: `https://discord.com/api/webhooks/${PARTY.id}/${PARTY.token}`,
    });
    seen = fake.requests.length;
    player = await openAs(playerId);
    await player.subscribe('singleCharacter', lyraId);
    await player.subscribe('partyBoard', folderId);

    // The game master moves on: the goblin's turn ends, Lyra's starts
    await (advanceInitiative as any)._execute({ userId: gmId }, { folderId, step: 1 });
    for (let i = 0; i < 100; i += 1) {
      if (player.messages.some(message => message.collection === 'creatureLogs' && message.fields?.creatureId === lyraId)) break;
      await pause(100);
    }
    await pause(500);
    await discordIntakeIdle();
    await sender.idle();
  });

  after(async function () {
    player?.close();
    if (sender) {
      await discordIntakeIdle();
      await sender.idle();
      setWebhookSender(previous);
    }
    await fake?.close();
    await removeAllCreaturesAndProps();
    await CreatureLogs.removeAsync({ creatureId: { $in: [lyraId, goblinId] } });
    await CreatureFolders.removeAsync(folderId);
    await Meteor.users.removeAsync({ _id: { $in: [gmId, playerId] } });
  });

  it('ends it in her log, under the goblin\'s turn, by its name alone; the goblin\'s own turn stays in its log', async function () {
    assert.isTrue((await CreatureProperties.findOneAsync({ 'root.id': lyraId, name: 'Frightened' }) as any)?.removed);
    const [log, ...more] = await CreatureLogs.find({ creatureId: lyraId }).fetchAsync() as any[];
    assert.isEmpty(more, 'one entry');
    assert.deepEqual(log.content.map(line => [line.name, line.value]), [
      ['End of Goblin 2\'s turn', undefined],
      ['Frightened', 'Ended: its duration ran out'],
    ]);
    // The goblin's turn, in its own log: its game master's
    const goblinLog = await CreatureLogs.findOneAsync({ creatureId: goblinId }) as any;
    const goblinLines = goblinLog?.content.map(line => line.name);
    assert.includeMembers(goblinLines, ['End of turn', 'SECRET-LAIR', 'SECRET-SEAL', 'Resource restored']);
  });

  it('sends the player nothing of the goblin\'s turn nor stats, in any frame', function () {
    const raw = withoutDates(player.messages);
    for (const canary of CANARIES) assert.notInclude(raw, canary, `the player received "${canary}"`);
    assert.include(raw, 'logs.turnEndOf', 'the search proves something: her entry arrived');
    assert.isEmpty(player.messages.filter(message => message.collection === 'creatureLogs'
      && message.fields?.creatureId === goblinId));
  });

  it('posts her entry once to the party\'s Discord channel, never the goblin\'s', function () {
    const posts = fake.requests.slice(seen).filter(request => request.method !== 'GET' && request.webhookId === PARTY.id)
      .map(request => request.body);
    const text = withoutDates(posts);
    for (const canary of CANARIES) assert.notInclude(text, canary);
    // The log entries, posted under their creature's name; the tracker's own
    // messages (the fight's, "Your turn") are the board's
    const entries = posts.filter(post => post.username);
    assert.lengthOf(entries, 1, text);
    assert.equal(entries[0].username, 'Lyra');
    assert.include(withoutDates(entries[0]), 'End of Goblin 2\'s turn');
    assert.include(withoutDates(entries[0]), 'Frightened');
  });
});
