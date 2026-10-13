import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import {
  createTestCreature, getRandomIds, removeAllCreaturesAndProps, runActionById,
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import writeActionResults from '/imports/api/engine/action/functions/writeActionResults';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import { hiddenFrom, hidesStatsFromPlayers } from '/imports/api/creature/creatureFolders/boardMonsters';

/*
 * A player's character hits a game master's monster: the character's log,
 * which the players read, says the damage dealt, never what it did to the
 * monster's hit points (capped by what it had left, it gives them away). The
 * monster's own log, its game master's, has the whole entry.
 */

const [heroId, goblinId, allyId, swordId, goblinHpId, allyHpId, wolfId, heroHpId, biteId] = getRandomIds(9);

const hitPoints = (_id: string, total: number) => ({
  _id, type: 'attribute', name: 'Hit Points', attributeType: 'healthBar', variableName: 'hitPoints',
  baseValue: { calculation: String(total) },
});

// Every line of a log entry, as stored
const text = (log: any) => JSON.stringify(log?.content ?? []);

describe('A game master\'s creature\'s hit points stay out of the players\' logs (hiddenStats)', function () {
  // The game master and a player, who is the game master of a party of their own
  const gm = 'gm', player = 'player';
  const monster = (owner: string) => ({ type: 'monster', owner });
  const npc = (owner: string) => ({ type: 'npc', owner });
  const pc = (owner: string) => ({ type: 'pc', owner });

  it('hides a monster\'s or a non-player character\'s stats from any log but its owner\'s monsters\'', function () {
    assert.isTrue(hiddenFrom(pc(player), monster(gm)));
    assert.isTrue(hiddenFrom(pc(player), npc(gm)));
    assert.isTrue(hiddenFrom({ owner: player }, monster(gm)), 'a creature without a type is a character');
    assert.isFalse(hiddenFrom(pc(player), pc(gm)));
    assert.isFalse(hiddenFrom(pc(player), undefined));
    assert.isFalse(hiddenFrom(monster(gm), monster(gm)), 'the game master\'s own, in their monster\'s log');
    assert.isFalse(hiddenFrom(npc(gm), monster(gm)));
  });

  it('depends on the owners: a monster of the player\'s hides the game master\'s, their character too', function () {
    assert.isTrue(hiddenFrom(monster(player), monster(gm)), 'a monster the player owns reads nothing of the game master\'s');
    assert.isTrue(hiddenFrom(npc(player), monster(gm)));
    assert.isTrue(hiddenFrom(monster(undefined as any), monster(undefined as any)), 'owners unknown: hidden');
    // The game master's own character posts to the party's Discord channel,
    // which the players read: it never shows their monster's stats
    assert.isTrue(hiddenFrom(pc(gm), monster(gm)));
  });

  it('hides from a party\'s players the stats of its game master\'s monsters, not another owner\'s', function () {
    assert.isTrue(hidesStatsFromPlayers(monster(gm), gm));
    assert.isTrue(hidesStatsFromPlayers(npc(gm), gm));
    assert.isFalse(hidesStatsFromPlayers(pc(gm), gm));
    assert.isFalse(hidesStatsFromPlayers(monster(player), gm), 'a player\'s monster is no monster of the game master\'s');
    assert.isFalse(hidesStatsFromPlayers(monster(gm), undefined));
    assert.isFalse(hidesStatsFromPlayers(undefined, gm));
  });
});

if (Meteor.isServer) describe('The log of a player\'s character hitting a game master\'s monster', function () {
  this.timeout(20000);

  before(async function () {
    await removeAllCreaturesAndProps();
    await createTestCreature({
      _id: heroId, name: 'Aria', type: 'pc',
      props: [
        // 9 damage, more than the 7 hit points the goblin has
        { _id: swordId, type: 'damage', target: 'target', damageType: 'slashing', amount: { calculation: '9' } },
        hitPoints(heroHpId, 30),
      ],
    });
    await createTestCreature({ _id: goblinId, name: 'Goblin', type: 'monster', props: [hitPoints(goblinHpId, 7)] });
    await createTestCreature({ _id: allyId, name: 'Borin', type: 'pc', props: [hitPoints(allyHpId, 7)] });
  });

  after(async function () {
    await CreatureLogs.removeAsync({ creatureId: { $in: [heroId, goblinId, allyId, wolfId] } });
    await removeAllCreaturesAndProps();
  });

  const latestLog = (creatureId: string) => CreatureLogs.findOneAsync({ creatureId }, { sort: { date: -1 } });

  it('says the damage dealt, not what it did to the monster\'s hit points; the monster\'s log has it all', async function () {
    const action = await runActionById(swordId, [goblinId]);
    await writeActionResults(action);
    const heroLog = await latestLog(heroId);
    assert.include(text(heroLog), '**9** slashing damage', 'the damage dealt, as rolled');
    // The engine writes a minus sign, U+2212
    assert.notInclude(text(heroLog), '\u22127', 'not capped by the hit points it had left');
    assert.notInclude(text(heroLog), '7 Hit Points');
    assert.notInclude(text(heroLog), 'logs.attributeDamaged');
    assert.notInclude(text(heroLog), 'Hit Points');

    const goblinLog = await latestLog(goblinId);
    assert.isDefined(goblinLog, 'its game master reads the whole entry in the monster\'s log');
    assert.equal(goblinLog?.content[0].name, 'Aria\'s action');
    assert.include(text(goblinLog), '\u22127 Hit Points');
    assert.equal(goblinLog?.creatureName, 'Aria');
  });

  it('keeps every line when the character hits another character', async function () {
    const action = await runActionById(swordId, [allyId]);
    await writeActionResults(action);
    const heroLog = await latestLog(heroId);
    assert.include(text(heroLog), '\u22127 Hit Points');
    assert.notInclude(text(heroLog), '**9** slashing damage', 'as before');
    assert.isUndefined(await latestLog(allyId), 'no entry of its own');
  });

  it('keeps every line in a monster\'s own log, its game master\'s', async function () {
    await createTestCreature({
      _id: wolfId, name: 'Wolf', type: 'monster',
      props: [{ _id: biteId, type: 'damage', target: 'target', damageType: 'piercing', amount: { calculation: '3' } }],
    });
    const action = await runActionById(biteId, [heroId]);
    await writeActionResults(action);
    assert.include(text(await latestLog(wolfId)), '\u22123 Hit Points');
    await CreatureLogs.removeAsync({ creatureId: wolfId });
  });
});

/*
 * Who may read a monster's hit points depends on its owner, not on the types
 * alone: any user owns monsters, as the game master of a party of their own.
 * The type alone let a monster read any other: a player acting with a monster
 * of theirs read the game master's.
 */
if (Meteor.isServer) describe('Hidden stats depend on the owners', function () {
  this.timeout(20000);

  const [gmId, playerId] = getRandomIds(2);
  const [
    gmGoblinId, gmGoblinHpId, impId, impHpId, clawId, gmHeroId, staffId, gmWolfId, wolfBiteId,
  ] = getRandomIds(9);
  const creatureIds = [gmGoblinId, impId, gmHeroId, gmWolfId];
  const damage = (_id: string, amount: number) => ({
    _id, type: 'damage', target: 'target', damageType: 'fire', amount: { calculation: String(amount) },
  });

  // Fresh creatures for each test: a goblin hit before has no hit points left
  beforeEach(async function () {
    await removeAllCreaturesAndProps();
    // The game master's goblin, 7 hit points: 9 damage take −7
    await createTestCreature({ _id: gmGoblinId, owner: gmId, name: 'Goblin', type: 'monster', props: [hitPoints(gmGoblinHpId, 7)] });
    // A monster of the player's, 20 hit points: 9 damage take −9
    await createTestCreature({
      _id: impId, owner: playerId, name: 'Imp', type: 'monster', props: [damage(clawId, 9), hitPoints(impHpId, 20)],
    });
    await createTestCreature({ _id: gmHeroId, owner: gmId, name: 'Gandalf', type: 'pc', props: [damage(staffId, 9)] });
    await createTestCreature({ _id: gmWolfId, owner: gmId, name: 'Wolf', type: 'monster', props: [damage(wolfBiteId, 3)] });
  });

  afterEach(async function () {
    await CreatureLogs.removeAsync({ creatureId: { $in: creatureIds } });
  });

  after(async function () {
    await removeAllCreaturesAndProps();
  });

  const latestLog = (creatureId: string) => CreatureLogs.findOneAsync({ creatureId }, { sort: { date: -1 } });

  it('hides the game master\'s goblin\'s hit points from a monster of the player\'s', async function () {
    await writeActionResults(await runActionById(clawId, [gmGoblinId]));
    const impLog = await latestLog(impId);
    assert.include(text(impLog), '**9** fire damage', 'the damage dealt');
    assert.notInclude(text(impLog), '−7 Hit Points', 'not what it did to the goblin\'s hit points');
    assert.notInclude(text(impLog), 'logs.attributeDamaged');
    assert.include(text(await latestLog(gmGoblinId)), '−7 Hit Points', 'the game master reads it in the goblin\'s log');
  });

  it('hides them from the game master\'s own character, whose log the party\'s channel shows', async function () {
    await writeActionResults(await runActionById(staffId, [gmGoblinId]));
    assert.notInclude(text(await latestLog(gmHeroId)), '−7 Hit Points');
    assert.include(text(await latestLog(gmGoblinId)), '−7 Hit Points');
  });

  it('keeps them in the log of another monster of the same game master\'s', async function () {
    await writeActionResults(await runActionById(wolfBiteId, [gmGoblinId]));
    assert.include(text(await latestLog(gmWolfId)), '−3 Hit Points');
  });

  it('gives a target of another owner\'s the entry without the game master\'s goblin\'s hit points', async function () {
    await writeActionResults(await runActionById(staffId, [gmGoblinId, impId]));
    const impLog = await latestLog(impId);
    assert.isDefined(impLog, 'the imp\'s owner reads the entry in its log');
    assert.include(text(impLog), '−9 Hit Points', 'what it did to the imp');
    assert.notInclude(text(impLog), '−7 Hit Points', 'not what it did to the goblin');
    assert.include(text(await latestLog(gmGoblinId)), '−7 Hit Points');
  });
});
