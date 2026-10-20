import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import {
  createTestCreature, getRandomIds, removeAllCreaturesAndProps,
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import type { ForestProp } from '/imports/api/engine/computation/utility/propsFromForest.testFn';
import { reloadCachedProperties } from '/imports/api/engine/loadCreatures';
import computeCreature from '/imports/api/engine/computeCreature';
import { insertAction } from '/imports/api/engine/action/methods/insertAction';
import { runAction } from '/imports/api/engine/action/methods/runAction';

/*
 * A condition a monster's saving throw imposes, which its target repeats at
 * the end of each of its turns (phase 3.6, the bestiary's "repeat the saving
 * throw" abilities): the condition's buff holds a trigger of the target's
 * `turnEnd`, whose saving throw, at the DC the monster had when it applied
 * the buff, removes the buff on a success.
 */
if (Meteor.isServer) describe('Conditions ended by a repeated saving throw', function () {
  this.timeout(20000);
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { default: runTurnEvent } = require('/imports/api/engine/action/server/runTurnEvent');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const buffOf = (creatureId: string) => CreatureProperties.findOneAsync({
    'root.id': creatureId, type: 'buff', name: 'Paralyzed', removed: { $ne: true },
  });

  // The ghoul's claws, as the bestiary writes them: the monster's DC, frozen
  // into the buff when it is applied; the target's own saving throw
  const ghoulProps = (repeatDc: number, clawsId: string): ForestProp[] => [
    { type: 'constant', name: 'Repeat DC', variableName: 'repeatDc', calculation: String(repeatDc) },
    {
      _id: clawsId, type: 'savingThrow', name: 'Claws', target: 'target', stat: 'constitutionSave',
      // Always failed: the condition is applied
      dc: { calculation: '100' },
      children: [{
        type: 'branch', branchType: 'failedSave',
        children: [{
          type: 'buff', name: 'Paralyzed', tags: ['condition', 'paralyzedCondition'],
          duration: { calculation: '10' },
          children: [
            { type: 'effect', name: 'Paralyzed', operation: 'fail', stats: ['strengthSave'] },
            {
              type: 'trigger', name: 'Claws: repeat the saving throw', event: 'turnEnd', timing: 'after',
              children: [{
                type: 'savingThrow', name: 'Claws', target: 'self', stat: 'constitutionSave',
                dc: { calculation: 'repeatDc' },
                children: [{
                  type: 'branch', branchType: 'successfulSave',
                  children: [{ type: 'buffRemover', name: 'End of Paralyzed', targetParentBuff: true }],
                }],
              }],
            },
          ],
        }],
      }],
    },
  ] as ForestProp[];

  const heroProps: ForestProp[] = [
    { type: 'attribute', name: 'Constitution', attributeType: 'ability', variableName: 'constitution', baseValue: { calculation: '10' } },
    { type: 'skill', name: 'Constitution Save', skillType: 'save', variableName: 'constitutionSave', ability: 'constitution' },
    { type: 'skill', name: 'Strength Save', skillType: 'save', variableName: 'strengthSave', ability: 'constitution' },
  ];

  let ownerId: string;
  beforeEach(async function () {
    await removeAllCreaturesAndProps();
    await CreatureLogs.removeAsync({});
    [ownerId] = getRandomIds(1);
    await Meteor.users.rawCollection().insertOne({ _id: ownerId, createdAt: new Date(), username: `saves-${ownerId}` } as any);
  });

  afterEach(async function () {
    await Meteor.users.removeAsync(ownerId);
  });

  after(async function () {
    await removeAllCreaturesAndProps();
    await CreatureLogs.removeAsync({});
  });

  /** The ghoul claws the hero, its DC for the repeated saves `repeatDc` */
  async function clawed(repeatDc: number) {
    const [ghoulId, heroId, clawsId] = getRandomIds(3);
    const execute = (method: unknown, args: unknown): Promise<any> =>
      (method as { _execute(invocation: { userId: string }, args: unknown): Promise<any> })._execute({ userId: ownerId }, args);
    await createTestCreature({ _id: ghoulId, name: 'Ghoul', owner: ownerId, type: 'monster', props: ghoulProps(repeatDc, clawsId) });
    await createTestCreature({ _id: heroId, name: 'Hero', owner: ownerId, props: heroProps });
    const actionId = await execute(insertAction, {
      action: { creatureId: ghoulId, task: { prop: { _id: clawsId }, targetIds: [heroId] }, results: [], taskCount: 0 },
    });
    await execute(runAction, { actionId, decisions: [] });
    await reloadCachedProperties(heroId);
    await computeCreature(heroId);
    return heroId;
  }

  it('applies the condition with the monster\'s DC frozen into its repeated saving throw', async function () {
    const heroId = await clawed(100);
    const buff = await buffOf(heroId);
    assert.exists(buff, 'the failed save paralyzes the hero');
    const repeat = await CreatureProperties.findOneAsync({ 'root.id': heroId, type: 'savingThrow', removed: { $ne: true } }) as any;
    assert.equal(repeat?.dc?.calculation, '100', 'the ghoul\'s DC, not the hero\'s `repeatDc`');
  });

  it('ends the condition at the end of the target\'s turn when the repeated save succeeds', async function () {
    const heroId = await clawed(-10);
    assert.exists(await buffOf(heroId));
    assert.equal(await runTurnEvent(heroId, 'turnEnd'), 'logged');
    assert.notExists(await buffOf(heroId), 'the successful save removes it');
    const [log] = (await CreatureLogs.find({ creatureId: heroId }, { sort: { date: 1 } }).fetchAsync()).slice(-1) as any[];
    const lines = log.content.map((line: any) => `${line.name}: ${line.value ?? ''}`).join('\n');
    assert.include(lines, 'Claws');
  });

  it('keeps the condition while the repeated save fails', async function () {
    const heroId = await clawed(100);
    assert.equal(await runTurnEvent(heroId, 'turnEnd'), 'logged');
    assert.exists(await buffOf(heroId), 'still paralyzed');
  });
});
