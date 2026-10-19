import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import EngineActions from '/imports/api/engine/action/EngineActions';
import {
  createTestCreature, getRandomIds, removeAllCreaturesAndProps, type TestCreature,
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import { insertAction } from '/imports/api/engine/action/methods/insertAction';
import type { ForestProp } from '/imports/api/engine/computation/utility/propsFromForest.testFn';

/*
 * A creature's turn starting or ending, on the server (phase 3.1): its
 * effects lose a round, its triggers of the event fire, what resets on it
 * resets, in that order, written and logged once under the event's title;
 * nothing at all for a creature with nothing to do.
 */
if (Meteor.isServer) describe('Turn events (runTurnEvent)', function () {
  this.timeout(20000);
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { default: runTurnEvent } = require('/imports/api/engine/action/server/runTurnEvent');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const prop = async (creatureId: string, name: string) => CreatureProperties.findOneAsync({ 'root.id': creatureId, name }) as any;
  const logsOf = (creatureId: string) => CreatureLogs.find({ creatureId }, { sort: { date: 1 } }).fetchAsync() as Promise<any[]>;
  const lastComputedAt = async (creatureId: string) => (await Creatures.findOneAsync(creatureId) as any)?.lastComputedAt?.getTime();

  // A troll: regeneration a flag can block until its next turn, effects that
  // last some rounds, legendary actions and a use back at the start of its turn
  const trollProps = (extra: ForestProp[] = []): ForestProp[] => [
    {
      type: 'attribute', name: 'Hit Points', attributeType: 'healthBar', variableName: 'hitPoints',
      baseValue: { calculation: '30' }, damage: 20,
    },
    // 1: it regenerates; 0, once fire or acid hurt it, it does not this turn
    {
      type: 'attribute', name: 'Regeneration allowed', attributeType: 'utility', variableName: 'regenerationAllowed',
      baseValue: { calculation: '1' }, damage: 1, reset: 'turnStart',
    },
    {
      type: 'attribute', name: 'Legendary Actions', attributeType: 'resource', variableName: 'legendaryActions',
      baseValue: { calculation: '3' }, damage: 2, reset: 'turnStart',
    },
    { type: 'action', name: 'Tail Swipe', uses: { calculation: '1' }, usesUsed: 1, reset: 'turnStart' },
    // Removed, in the trash: a loaded creature's cache still holds them
    {
      type: 'attribute', name: 'Removed resource', attributeType: 'resource', variableName: 'removedResource',
      baseValue: { calculation: '3' }, damage: 1, reset: 'turnStart', removed: true,
    },
    { type: 'action', name: 'Removed swipe', uses: { calculation: '1' }, usesUsed: 1, reset: 'turnStart', removed: true },
    { type: 'trigger', name: 'Before its effects', event: 'turnStart', timing: 'before' },
    {
      type: 'trigger', name: 'Regeneration', event: 'turnStart', timing: 'after',
      condition: { calculation: 'regenerationAllowed > 0' },
      children: [{
        type: 'adjustment', operation: 'increment', stat: 'hitPoints', target: 'self', amount: { calculation: '-10' },
      }],
    },
    { type: 'trigger', name: 'At the end of its turn', event: 'turnEnd', timing: 'after' },
    { type: 'buff', name: 'Haste', duration: { calculation: '1' } },
    { type: 'buff', name: 'Bless', duration: { calculation: '3' } },
    ...extra,
  ];

  async function creature(props: ForestProp[], type: TestCreature['type'] = 'monster') {
    const [_id] = getRandomIds(1);
    await createTestCreature({ _id, name: 'Troll', type, props });
    return _id;
  }

  beforeEach(async function () {
    await removeAllCreaturesAndProps();
    await CreatureLogs.removeAsync({});
  });

  after(async function () {
    await removeAllCreaturesAndProps();
    await CreatureLogs.removeAsync({});
  });

  it('starts a turn: triggers timed before, effects, other triggers, then resets, in one entry titled "Start of turn"', async function () {
    const trollId = await creature(trollProps());
    assert.equal(await runTurnEvent(trollId, 'turnStart'), 'logged');
    const logs = await logsOf(trollId);
    assert.lengthOf(logs, 1, 'one entry');
    const lines = logs[0].content.filter(line => !line.silenced).map(line => line.name);
    const all = logs[0].content.map(line => line.name);
    assert.equal(lines[0], 'Start of turn');
    assert.deepEqual(logs[0].content[0].i18n, { name: { key: 'logs.turnStart' } }, 'in the reader\'s language');
    assert.includeMembers(lines, ['Before its effects', 'Haste']);
    assert.isBelow(lines.indexOf('Before its effects'), lines.indexOf('Haste'));
    // The resets are kept, silenced
    assert.notInclude(lines, 'Tail Swipe', 'a reset says nothing');
    assert.include(all, 'Tail Swipe');
    assert.isBelow(all.indexOf('Haste'), all.indexOf('Tail Swipe'), 'the effects end before the resets');
    assert.notInclude(lines, 'At the end of its turn');
    // The flag was down when the trigger read it: no regeneration this turn
    assert.notInclude(lines, 'Regeneration');
    assert.equal((await prop(trollId, 'Hit Points')).damage, 20);

    // What the event did
    assert.isTrue((await prop(trollId, 'Haste')).removed, 'its last round is spent');
    assert.equal((await prop(trollId, 'Bless')).durationSpent, 1);
    assert.equal((await prop(trollId, 'Legendary Actions')).damage, 0);
    assert.equal((await prop(trollId, 'Tail Swipe')).usesUsed, 0);
    assert.equal((await prop(trollId, 'Regeneration allowed')).damage, 0, 'reset after the trigger read it');
    assert.equal((await prop(trollId, 'Removed resource')).damage, 1, 'a removed property resets on nothing');
    assert.equal((await prop(trollId, 'Removed swipe')).usesUsed, 1, 'nor do the uses of a removed action');
    assert.notInclude(logs[0].content.map(line => line.name), 'Removed swipe');

    // The next turn: the flag is up, it regenerates
    assert.equal(await runTurnEvent(trollId, 'turnStart'), 'logged');
    const next = (await logsOf(trollId))[1].content.map(line => line.name);
    assert.include(next, 'Regeneration');
    assert.equal((await prop(trollId, 'Hit Points')).damage, 10);
  });

  it('says nothing of resets alone: a reaction back at every turn is written and computed, with no log entry', async function () {
    const heroId = await creature([
      {
        type: 'attribute', name: 'Reaction', attributeType: 'resource', variableName: 'reaction',
        baseValue: { calculation: '1' }, damage: 1, reset: 'turnStart',
      },
      { type: 'action', name: 'Second Wind', uses: { calculation: '1' }, usesUsed: 1, reset: 'turnStart' },
    ], 'pc');
    const before = await lastComputedAt(heroId);
    assert.equal(await runTurnEvent(heroId, 'turnStart'), 'silent');
    assert.lengthOf(await logsOf(heroId), 0, 'no log entry');
    assert.equal((await prop(heroId, 'Reaction')).damage, 0, 'restored');
    assert.equal((await prop(heroId, 'Second Wind')).usesUsed, 0, 'restored');
    assert.notEqual(await lastComputedAt(heroId), before, 'computed with the change');
  });

  it('ends a turn: its own triggers and resets, no effect losing a round', async function () {
    const trollId = await creature(trollProps([
      { type: 'attribute', name: 'Reaction', attributeType: 'resource', variableName: 'reaction', baseValue: { calculation: '1' }, damage: 1, reset: 'turnEnd' },
    ]));
    assert.equal(await runTurnEvent(trollId, 'turnEnd'), 'logged');
    const [log] = await logsOf(trollId);
    const lines = log.content.filter(line => !line.silenced).map(line => line.name);
    assert.equal(lines[0], 'End of turn');
    assert.include(lines, 'At the end of its turn');
    assert.notIncludeMembers(lines, ['Before its effects', 'Haste', 'Regeneration']);
    assert.equal((await prop(trollId, 'Reaction')).damage, 0);
    assert.equal((await prop(trollId, 'Legendary Actions')).damage, 2, 'it resets at the start of a turn');
    assert.isNotTrue((await prop(trollId, 'Haste')).removed);
    assert.isUndefined((await prop(trollId, 'Bless')).durationSpent);
  });

  it('costs nothing for a creature with nothing to do: no engine, no log, no computation', async function () {
    // A goblin: no trigger, nothing that resets on a turn, no effect with a duration
    const goblinId = await creature([
      { type: 'attribute', name: 'Hit Points', attributeType: 'healthBar', variableName: 'hitPoints', baseValue: { calculation: '7' }, reset: 'longRest', damage: 2 },
      { type: 'action', name: 'Scimitar', uses: { calculation: '1' }, usesUsed: 1, reset: 'shortRest' },
      { type: 'buff', name: 'Prone' },
      { type: 'trigger', name: 'On a long rest', event: 'longRest' },
      // Resets on a turn start, with nothing to reset
      { type: 'attribute', name: 'Reaction', attributeType: 'resource', variableName: 'reaction', baseValue: { calculation: '1' }, reset: 'turnStart' },
    ]);
    const computed = await lastComputedAt(goblinId);
    assert.equal(await runTurnEvent(goblinId, 'turnStart'), 'nothing');
    assert.equal(await runTurnEvent(goblinId, 'turnEnd'), 'nothing');
    assert.lengthOf(await logsOf(goblinId), 0);
    assert.equal(await lastComputedAt(goblinId), computed, 'not computed again');
  });

  it('writes and computes nothing when the engine changed nothing, and logs nothing when it showed nothing', async function () {
    // Its trigger's condition does not hold
    const quietId = await creature([
      { type: 'attribute', name: 'Rage', attributeType: 'utility', variableName: 'raging', baseValue: { calculation: '0' } },
      { type: 'trigger', name: 'Rage ends', event: 'turnEnd', condition: { calculation: 'raging > 0' } },
    ]);
    const computed = await lastComputedAt(quietId);
    assert.equal(await runTurnEvent(quietId, 'turnEnd'), 'unchanged');
    assert.lengthOf(await logsOf(quietId), 0);
    assert.equal(await lastComputedAt(quietId), computed, 'not computed again');

    // An effect loses a round, and a silent trigger fires: written, not logged
    const blessedId = await creature([
      { type: 'buff', name: 'Bless', duration: { calculation: '1 minute' } },
      { type: 'trigger', name: 'Silent', event: 'turnStart', silent: true },
    ]);
    const before = await lastComputedAt(blessedId);
    assert.equal(await runTurnEvent(blessedId, 'turnStart'), 'silent');
    assert.lengthOf(await logsOf(blessedId), 0);
    assert.equal((await prop(blessedId, 'Bless')).durationSpent, 1);
    assert.notEqual(await lastComputedAt(blessedId), before, 'computed with the change');
  });

  it('counts no effect down when the party does not, its triggers and resets still happen', async function () {
    const trollId = await creature(trollProps());
    assert.equal(await runTurnEvent(trollId, 'turnStart', { countDurations: false }), 'logged');
    assert.isNotTrue((await prop(trollId, 'Haste')).removed);
    assert.isUndefined((await prop(trollId, 'Bless')).durationSpent);
    assert.equal((await prop(trollId, 'Legendary Actions')).damage, 0);
    const lines = (await logsOf(trollId))[0].content.map(line => line.name);
    assert.include(lines, 'Before its effects');
  });

  it('asks nobody: a choice is left unmade, with a line, and the dice are its own', async function () {
    const trollId = await creature([
      {
        type: 'trigger', name: 'Recharge', event: 'turnStart',
        children: [
          { type: 'roll', name: 'Recharge roll', variableName: 'rechargeRoll', roll: { calculation: '1d6' } },
          {
            type: 'branch', branchType: 'choice',
            children: [{ type: 'note', name: 'Option A' }, { type: 'note', name: 'Option B' }],
          },
        ],
      },
    ]);
    assert.equal(await runTurnEvent(trollId, 'turnStart'), 'logged');
    const [log] = await logsOf(trollId);
    const choice = log.content.find(line => line.name === 'Choice not made');
    assert.exists(choice, JSON.stringify(log.content));
    assert.equal(choice.value, 'Option A, Option B');
    const names = log.content.map(line => line.name);
    assert.notIncludeMembers(names, ['Option A', 'Option B'], 'neither applied');
    const roll = log.content.find(line => line.name === 'Recharge roll');
    const total = Number(/\*\*(\d+)\*\*\s*$/.exec(roll?.value || '')?.[1]);
    assert.isAtLeast(total, 1, JSON.stringify(roll));
    assert.isAtMost(total, 6);
  });

  it('never inserts its action: the action a player has in progress on the creature survives', async function () {
    const trollId = await creature(trollProps(), 'pc');
    const inProgress = await EngineActions.insertAsync({
      creatureId: trollId, results: [], taskCount: 0, task: { targetIds: [], subtaskFn: 'check' }, insertedAt: new Date(),
    } as any);
    const actions = await EngineActions.find({}).countAsync();
    assert.equal(await runTurnEvent(trollId, 'turnStart'), 'logged');
    assert.exists(await EngineActions.findOneAsync(inProgress), 'still there');
    assert.equal(await EngineActions.find({}).countAsync(), actions, 'none inserted');
    await EngineActions.removeAsync(inProgress);
  });

  it('is never a client\'s to send', async function () {
    const trollId = await creature(trollProps(), 'pc');
    const owner = (await Creatures.findOneAsync(trollId) as any).owner;
    await Meteor.users.rawCollection().insertOne({ _id: owner, createdAt: new Date() } as any);
    let error;
    try {
      await (insertAction as any)._execute({ userId: owner }, {
        action: {
          creatureId: trollId, results: [], taskCount: 0,
          task: { subtaskFn: 'turnEvent', eventName: 'turnStart', targetIds: [trollId] },
        },
      });
    } catch (e) {
      error = e;
    }
    await Meteor.users.removeAsync(owner);
    assert.equal((error as any)?.reason, 'Unknown task');
    assert.isNotTrue((await prop(trollId, 'Haste')).removed);
  });
});
