import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { EJSON } from 'meteor/ejson';
import EngineActions, { EngineAction } from '/imports/api/engine/action/EngineActions';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { insertAction } from '/imports/api/engine/action/methods/insertAction';
import { runAction } from '/imports/api/engine/action/methods/runAction';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import {
  createTestCreature, getRandomIds, removeAllCreaturesAndProps, TestCreature,
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import { MAX_TASK_TARGETS } from '/imports/api/engine/action/functions/taskFromDatabase';
import { openAs, refusal as refusalOf } from '/imports/api/utility/ddpClient.testFn';

/*
 * insertAction stores the task the server will apply: the properties it names
 * are read from the database, whatever copy the client sent. A modified client
 * could otherwise raise an attack's bonus, or name another creature's
 * property, which the action's results would write to.
 */
if (Meteor.isServer) describe('Action tasks: the server applies the database\'s properties', function () {
  this.timeout(30000);

  const [
    ownerId, creatureId, otherCreatureId, attackId, damageId, hitPointsId, arrowsId, spellId,
    removedId, otherAttackId, otherHitPointsId,
  ] = getRandomIds(11);
  const creature: TestCreature = {
    _id: creatureId,
    owner: ownerId,
    props: [
      {
        _id: attackId,
        type: 'action',
        name: 'Longbow',
        attackRoll: { calculation: '5' },
        children: [{
          _id: damageId,
          type: 'damage',
          damageType: 'piercing',
          amount: { calculation: '1d8 + 3' },
        }],
      },
      {
        _id: hitPointsId,
        type: 'attribute',
        name: 'Hit Points',
        attributeType: 'healthBar',
        variableName: 'hitPoints',
        baseValue: { calculation: '30' },
      },
      { _id: arrowsId, type: 'item', name: 'Arrows', quantity: 20 },
      { _id: spellId, type: 'spell', name: 'Fire Bolt', level: 0 },
      { _id: removedId, type: 'action', name: 'Forgotten trick', removed: true, removedAt: new Date() },
    ],
  };
  const otherCreature: TestCreature = {
    _id: otherCreatureId,
    owner: ownerId,
    props: [
      { _id: otherAttackId, type: 'action', name: 'Bite', attackRoll: { calculation: '4' } },
      {
        _id: otherHitPointsId,
        type: 'attribute',
        name: 'Hit Points',
        attributeType: 'healthBar',
        variableName: 'hitPoints',
        baseValue: { calculation: '10' },
      },
    ],
  };

  const execute = (userId: string, task: any, { isSimulation = false } = {}): Promise<string> =>
    (insertAction as any)._execute({ userId, isSimulation }, {
      action: { creatureId, task, results: [], taskCount: 0 },
    });
  const prop = async (_id: string) => EJSON.clone(await CreatureProperties.findOneAsync(_id)) as any;
  const storedTask = async (actionId: string) => (await EngineActions.findOneAsync(actionId) as EngineAction).task as any;
  async function refusal(task: any) {
    try {
      await execute(ownerId, task);
    } catch (e: any) {
      return e;
    }
    assert.fail('the task was accepted');
  }

  before(async function () {
    await removeAllCreaturesAndProps();
    await Meteor.users.rawCollection().insertOne({
      _id: ownerId, createdAt: new Date(), username: `task-test-${ownerId}`,
    } as any);
    await createTestCreature(creature);
    await createTestCreature(otherCreature);
  });

  after(async function () {
    await EngineActions.removeAsync({ creatureId });
    await Meteor.users.removeAsync(ownerId);
    await removeAllCreaturesAndProps();
  });

  it('replaces the property the client sent with the database\'s', async function () {
    const attack = await prop(attackId);
    const changed = {
      ...attack,
      name: 'Longbow +100',
      attackRoll: { ...attack.attackRoll, calculation: '100', value: 100 },
      usesLeft: 99,
    };
    const actionId = await execute(ownerId, { prop: changed, targetIds: [] });
    const { prop: stored } = await storedTask(actionId);
    assert.equal(stored.name, 'Longbow');
    assert.equal(stored.attackRoll.value, 5);
    assert.notProperty(stored, 'usesLeft');
    assert.deepEqual(stored, attack);
  });

  it('keeps the client\'s copy in the client\'s own simulation of the method', async function () {
    const changed = { ...await prop(attackId), name: 'As the client sees it' };
    const actionId = await execute(ownerId, { prop: changed, targetIds: [] }, { isSimulation: true });
    assert.equal((await storedTask(actionId)).prop.name, 'As the client sees it');
  });

  it('refuses a property of another creature, a removed one, or one that does not exist', async function () {
    const existing = await execute(ownerId, { prop: await prop(attackId), targetIds: [] });
    for (const [what, task] of [
      ['another creature\'s', { prop: await prop(otherAttackId), targetIds: [] }],
      ['removed', { prop: await prop(removedId), targetIds: [] }],
      ['made up', { prop: { ...await prop(attackId), _id: Random.id() }, targetIds: [] }],
    ]) {
      const error = await refusal(task);
      assert.equal(error?.error, 'not-found', `${what}: ${error?.message}`);
    }
    // Not even an id: check's Match error
    assert.match((await refusal({ prop: { type: 'action', name: 'Anything' }, targetIds: [] }))?.message, /Match error/);
    // Refused before anything changed: the creature's action is still there
    assert.exists(await EngineActions.findOneAsync(existing));
  });

  it('reads a damaged attribute again on its target, and keeps only the name of a property named', async function () {
    const hitPoints = await prop(hitPointsId);
    const actionId = await execute(ownerId, {
      subtaskFn: 'damageProp',
      targetIds: [creatureId],
      params: {
        title: 'Hit Points',
        operation: 'increment',
        value: 4,
        targetProp: { ...hitPoints, damageTriggerIds: { before: [otherAttackId] }, total: 1000 },
      },
    });
    assert.deepEqual((await storedTask(actionId)).params.targetProp, hitPoints);

    const error = await refusal({
      subtaskFn: 'damageProp',
      targetIds: [creatureId],
      params: { operation: 'increment', value: 4, targetProp: await prop(otherHitPointsId) },
    });
    assert.equal(error?.error, 'not-found');

    const named = await execute(ownerId, {
      subtaskFn: 'damageProp',
      targetIds: [creatureId],
      params: { operation: 'set', value: 2, targetProp: { name: 'hitPoints', damageTriggerIds: { before: [attackId] } } },
    });
    assert.deepEqual((await storedTask(named)).params.targetProp, { name: 'hitPoints' });

    for (const params of [
      { operation: 'increment', value: 'lots', targetProp: hitPoints },
      { operation: 'double', value: 4, targetProp: hitPoints },
    ]) {
      assert.exists(await refusal({ subtaskFn: 'damageProp', targetIds: [creatureId], params }));
    }
  });

  it('casts only a spell of the creature', async function () {
    const params = { slotId: undefined, ritual: false, withoutSpellSlot: true };
    const spell = await prop(spellId);
    const actionId = await execute(ownerId, {
      subtaskFn: 'castSpell', targetIds: [], prop: { ...spell, level: 9 }, params,
    });
    assert.deepEqual((await storedTask(actionId)).prop, spell);
    const error = await refusal({ subtaskFn: 'castSpell', targetIds: [], prop: await prop(attackId), params });
    assert.equal(error?.error, 'validation-error');
  });

  it('reads the ammunition and the action using it again', async function () {
    const attack = await prop(attackId);
    const arrows = await prop(arrowsId);
    const actionId = await execute(ownerId, {
      subtaskFn: 'consumeItemAsAmmo',
      targetIds: [],
      prop: attack,
      params: { value: 1, item: { ...arrows, quantity: 1000 }, skipChildren: false },
    });
    const { params } = await storedTask(actionId);
    assert.deepEqual(params.item, arrows);
    assert.isFalse(params.skipChildren);
    const error = await refusal({
      subtaskFn: 'consumeItemAsAmmo',
      targetIds: [],
      prop: attack,
      params: { value: 1, item: await prop(otherAttackId), skipChildren: false },
    });
    assert.equal(error?.error, 'not-found');
  });

  it('lets tasks without a property through, checking their fields', async function () {
    for (const task of [
      { subtaskFn: 'check', targetIds: [creatureId], advantage: 1, abilityVariableName: 'strength', dc: null },
      { subtaskFn: 'reset', targetIds: [creatureId], eventName: 'shortRest' },
      { subtaskFn: 'dealDamage', targetIds: [creatureId], params: { amount: 7, damageType: 'fire' } },
    ]) {
      const actionId = await execute(ownerId, task);
      assert.deepEqual(await storedTask(actionId), task, task.subtaskFn);
    }
    for (const task of [
      { subtaskFn: 'check', targetIds: [creatureId], advantage: 5, dc: null },
      { subtaskFn: 'reset', targetIds: [creatureId], eventName: { $gt: '' } },
      { subtaskFn: 'dealDamage', targetIds: [creatureId], params: { amount: Infinity } },
      { subtaskFn: 'somethingElse', targetIds: [creatureId] },
    ]) {
      assert.exists(await refusal(task), task.subtaskFn);
    }
  });
});

/*
 * The results of an action are the server's alone. insertAction stored the
 * ones the client sent and runAction wrote them with its own, by property id
 * only: whoever could edit one creature could set any field of any property of
 * any creature, and write any line in a log.
 */
if (Meteor.isServer) describe('Action results: the server ignores the client\'s', function () {
  this.timeout(30000);

  const [attackerId, attackerCreatureId, victimOwnerId, victimId, victimHitPointsId] = getRandomIds(5);

  before(async function () {
    await removeAllCreaturesAndProps();
    await Meteor.users.rawCollection().insertMany([
      { _id: attackerId, createdAt: new Date(), username: `results-attacker-${attackerId}` },
      { _id: victimOwnerId, createdAt: new Date(), username: `results-victim-${victimOwnerId}` },
    ] as any[]);
    await createTestCreature({ _id: attackerCreatureId, owner: attackerId, props: [] });
    await createTestCreature({
      _id: victimId,
      owner: victimOwnerId,
      props: [{
        _id: victimHitPointsId,
        type: 'attribute',
        name: 'Hit Points',
        attributeType: 'healthBar',
        variableName: 'hitPoints',
        baseValue: { calculation: '30' },
      }],
    });
  });

  after(async function () {
    await CreatureLogs.removeAsync({ creatureId: { $in: [attackerCreatureId, victimId] } });
    await EngineActions.removeAsync({ creatureId: attackerCreatureId });
    await Meteor.users.removeAsync({ _id: { $in: [attackerId, victimOwnerId] } });
    await removeAllCreaturesAndProps();
  });

  it('neither stores nor writes results the client sent, on any creature', async function () {
    const forged = [{
      // Required by the action's schema: a forged result passes it
      propId: victimHitPointsId,
      targetIds: [victimId],
      mutations: [{
        targetIds: [victimId],
        updates: [{ propId: victimHitPointsId, type: 'attribute', set: { name: 'Forged', damage: 29 } }],
        contents: [{ name: 'Forged line' }],
      }],
    }];
    const actionId: string = await (insertAction as any)._execute({ userId: attackerId, isSimulation: false }, {
      action: {
        creatureId: attackerCreatureId,
        task: { subtaskFn: 'dealDamage', targetIds: [attackerCreatureId], params: { amount: 1, damageType: 'fire' } },
        results: forged,
        taskCount: 0,
      },
    });
    assert.deepEqual((await EngineActions.findOneAsync(actionId) as EngineAction).results, [], 'stored without them');

    // Even if a stored action held some (one stored before the fix)
    await EngineActions.updateAsync(actionId, { $set: { results: forged as any } }, { bypassCollection2: true } as any);
    await (runAction as any)._execute({ userId: attackerId, isSimulation: false }, { actionId, decisions: [] });

    const victimHitPoints = await CreatureProperties.findOneAsync(victimHitPointsId) as any;
    assert.equal(victimHitPoints.name, 'Hit Points');
    assert.notEqual(victimHitPoints.damage, 29);
    const logs = await CreatureLogs.find({ creatureId: { $in: [attackerCreatureId, victimId] } }).fetchAsync();
    assert.notInclude(JSON.stringify(logs), 'Forged line');
  });
});

/*
 * An action's targets come from the client: the task is a blackbox in the
 * action's schema. insertAction read and checked every one, then the engine
 * applied the task to every one and recomputed every one, so a list of
 * thousands held the server. A fight holds 64 creatures: so many targets at most.
 */
if (Meteor.isServer) describe('Action targets: at most as many as a fight holds', function () {
  this.timeout(30000);

  const [ownerId, creatureId] = getRandomIds(2);

  before(async function () {
    await removeAllCreaturesAndProps();
    await Meteor.users.rawCollection().insertOne(
      { _id: ownerId, createdAt: new Date(), username: `targets-owner-${ownerId}` } as any,
    );
    await createTestCreature({ _id: creatureId, owner: ownerId, props: [] });
  });

  after(async function () {
    await EngineActions.removeAsync({ creatureId });
    await Meteor.users.removeAsync(ownerId);
    await removeAllCreaturesAndProps();
  });

  it('refuses a task with more than 64 targets, over DDP, and stores nothing', async function () {
    const client = await openAs(ownerId);
    // The user may edit every target: only their number is refused
    const insert = (count: number) => client.call('actions.insertAction', {
      action: {
        creatureId,
        task: { subtaskFn: 'dealDamage', targetIds: new Array(count).fill(creatureId), params: { amount: 1 } },
        results: [],
        taskCount: 0,
      },
    });
    try {
      const actionId = await insert(64);
      assert.lengthOf((await EngineActions.findOneAsync(actionId) as EngineAction).task.targetIds, 64);
      await EngineActions.removeAsync({ creatureId });

      const error = await refusalOf(insert(65));
      assert.exists(error, '65 targets are refused');
      assert.equal(error.error, 400, 'by the check of the targets');
      assert.equal(await EngineActions.find({ creatureId }).countAsync(), 0, 'nothing stored');
      assert.equal(MAX_TASK_TARGETS, 64, 'a fight\'s creatures');
    } finally {
      client.close();
    }
  });
});
