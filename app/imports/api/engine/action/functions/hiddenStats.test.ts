import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import {
  createTestCreature, getRandomIds, removeAllCreaturesAndProps, runActionById,
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import writeActionResults from '/imports/api/engine/action/functions/writeActionResults';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import { hidesStatsOf } from '/imports/api/engine/action/functions/hiddenStats';

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
  it('hides a monster\'s or a non-player character\'s stats from a player\'s character only', function () {
    assert.isTrue(hidesStatsOf({ type: 'pc' }, { type: 'monster' }));
    assert.isTrue(hidesStatsOf({ type: 'pc' }, { type: 'npc' }));
    assert.isTrue(hidesStatsOf({}, { type: 'monster' }), 'a creature without a type is a character');
    assert.isFalse(hidesStatsOf({ type: 'pc' }, { type: 'pc' }));
    assert.isFalse(hidesStatsOf({ type: 'monster' }, { type: 'monster' }), 'the game master\'s own');
    assert.isFalse(hidesStatsOf({ type: 'pc' }, undefined));
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
