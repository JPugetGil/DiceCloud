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
 * The SRD 5.1 bestiary's monsters at the start of their turn (phases 3.2 and
 * 3.4): a breath weapon spent recharges on a d6, the legendary actions come
 * back, a troll regenerates unless the game master spent its regeneration.
 * The properties are those tools/bestiary/convert.py writes (recharge,
 * legendary, regeneration), formulas included: the turn events of 3.1 run
 * them (runTurnEvent).
 */
if (Meteor.isServer) describe('The bestiary\'s monsters at the start of their turn', function () {
  this.timeout(60000);
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { default: runTurnEvent } = require('/imports/api/engine/action/server/runTurnEvent');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const prop = async (creatureId: string, variableName: string) =>
    CreatureProperties.findOneAsync({ 'root.id': creatureId, variableName }) as any;
  const logsOf = (creatureId: string) => CreatureLogs.find({ creatureId }, { sort: { date: 1 } }).fetchAsync() as Promise<any[]>;
  const shown = (log: any) => log.content.filter((line: any) => !line.silenced).map((line: any) => line.name);
  // Spends what the game master spends, as the sheet's buttons do
  async function setDamage(creatureId: string, variableName: string, damage: number) {
    const { _id } = await prop(creatureId, variableName);
    await CreatureProperties.updateAsync(_id, { $set: { damage, dirty: true } }, { selector: { type: 'attribute' } } as any);
    // As writeActionResults does: the cache first, which the observers update
    // some time after the write, then the computation, then the cache again
    await reloadCachedProperties(creatureId);
    await computeCreature(creatureId);
    await reloadCachedProperties(creatureId);
  }

  async function creature(name: string, props: ForestProp[]) {
    const [_id] = getRandomIds(1);
    await createTestCreature({ _id, name, type: 'monster', props });
    return _id;
  }

  const hitPoints = (total: number, damage = 0): ForestProp => ({
    type: 'attribute', name: 'Hit Points', attributeType: 'healthBar', variableName: 'hitPoints',
    baseValue: { calculation: String(total) }, reset: 'longRest', tags: ['hitPoints'], damage,
  });

  // An adult red dragon's breath and legendary actions, as the generator writes them
  const dragonProps = (): ForestProp[] => [
    hitPoints(256),
    {
      type: 'action', name: 'Fire Breath (Recharge 5–6)', actionType: 'action',
      resources: { itemsConsumed: [], attributesConsumed: [{ variableName: 'fireBreathCharge', quantity: { calculation: '1' } }] },
    },
    {
      type: 'attribute', name: 'Fire Breath (Recharge 5–6)', variableName: 'fireBreathCharge', attributeType: 'resource',
      baseValue: { calculation: '1' }, reset: 'longRest',
    },
    {
      type: 'trigger', name: 'Recharge: Fire Breath', event: 'turnStart', timing: 'after',
      condition: { calculation: 'fireBreathCharge < 1' },
      description: { text: 'At the start of its turn, if Fire Breath is not available, a d6: on a 5 or more, it is available again.' },
      children: [
        { type: 'roll', name: 'Recharge roll', variableName: 'fireBreathRechargeRoll', roll: { calculation: '1d6' } },
        {
          type: 'branch', branchType: 'if', condition: { calculation: 'fireBreathRechargeRoll >= 5' },
          children: [{
            type: 'adjustment', stat: 'fireBreathCharge', operation: 'set', amount: { calculation: '1' }, target: 'self',
          }],
        },
      ],
    },
    {
      type: 'attribute', name: 'Legendary Actions', variableName: 'legendaryActions', attributeType: 'resource',
      baseValue: { calculation: '3' }, reset: 'turnStart',
    },
  ];

  // A troll's regeneration, and an oni's, which needs a hit point left
  const regeneration = (amount: number, condition: string): ForestProp => ({
    type: 'trigger', name: 'Regeneration', event: 'turnStart', timing: 'after', condition: { calculation: condition },
    children: [{ type: 'damage', amount: { calculation: String(amount) }, damageType: 'healing', target: 'self' }],
  });
  const trollProps = (damage: number): ForestProp[] => [
    hitPoints(84, damage),
    { type: 'feature', name: 'Regeneration', summary: { text: 'The troll regains 10 hit points at the start of its turn.' } },
    regeneration(10, 'regeneration >= 1 && hitPoints < hitPoints.total'),
    {
      type: 'attribute', name: 'Regeneration next turn', variableName: 'regeneration', attributeType: 'resource',
      baseValue: { calculation: '1' }, reset: 'turnStart',
    },
  ];
  // What stops it by itself (the generator's block trigger): acid or fire
  // damage spends its regeneration, whoever deals it
  const blockProps = (): ForestProp[] => [{
    type: 'trigger', name: 'Regeneration stopped', event: 'damageProperty', timing: 'after', targetTags: ['hitPoints'],
    condition: { calculation: '~damageType == \'acid\' || ~damageType == \'fire\'' },
    children: [{
      type: 'adjustment', stat: 'regeneration', operation: 'increment', amount: { calculation: '1' }, target: 'self',
    }],
  }];
  const oniProps = (damage: number): ForestProp[] => [
    hitPoints(110, damage),
    regeneration(10, 'hitPoints >= 1 && hitPoints < hitPoints.total'),
  ];

  beforeEach(async function () {
    await removeAllCreaturesAndProps();
    await CreatureLogs.removeAsync({});
  });

  after(async function () {
    await removeAllCreaturesAndProps();
    await CreatureLogs.removeAsync({});
  });

  it('rolls no recharge while the breath is there, and brings the legendary actions back without a word', async function () {
    const dragonId = await creature('Adult Red Dragon', dragonProps());
    assert.equal(await runTurnEvent(dragonId, 'turnStart'), 'unchanged', 'its trigger\'s condition does not hold');
    await setDamage(dragonId, 'legendaryActions', 2);
    assert.equal(await runTurnEvent(dragonId, 'turnStart'), 'silent');
    assert.lengthOf(await logsOf(dragonId), 0, 'no roll, no line');
    assert.equal((await prop(dragonId, 'legendaryActions')).damage, 0, 'its three legendary actions back');
  });

  it('rolls a d6 at the start of its turn while the breath is spent: back on a 5 or 6, still spent otherwise', async function () {
    const dragonId = await creature('Adult Red Dragon', dragonProps());
    const seen = new Set<boolean>();
    for (let i = 0; i < 60 && seen.size < 2; i += 1) {
      await setDamage(dragonId, 'fireBreathCharge', 1);
      const logsBefore = (await logsOf(dragonId)).length;
      assert.equal(await runTurnEvent(dragonId, 'turnStart'), 'logged');
      const logs = await logsOf(dragonId);
      assert.lengthOf(logs, logsBefore + 1, 'one entry');
      const log = logs[logs.length - 1];
      assert.deepEqual(shown(log).slice(0, 3), ['Start of turn', 'Recharge: Fire Breath', 'Recharge roll']);
      const roll = log.content.find((line: any) => line.name === 'Recharge roll');
      const total = Number(/\*\*(\d+)\*\*\s*$/.exec(roll?.value || '')?.[1]);
      assert.isAtLeast(total, 1, JSON.stringify(roll));
      assert.isAtMost(total, 6);
      const back = (await prop(dragonId, 'fireBreathCharge')).damage === 0;
      assert.equal(back, total >= 5, `rolled ${total}`);
      seen.add(back);
    }
    assert.equal(seen.size, 2, 'both outcomes came up');
  });

  it('regenerates a troll at the start of its turn, unless the game master spent its regeneration, back for the next', async function () {
    const trollId = await creature('Troll', trollProps(30));
    assert.equal(await runTurnEvent(trollId, 'turnStart'), 'logged');
    assert.equal((await prop(trollId, 'hitPoints')).damage, 20, '10 hit points back');
    const [log] = await logsOf(trollId);
    assert.includeMembers(shown(log), ['Start of turn', 'Regeneration', 'Health bar restored']);
    assert.include(log.content.find((line: any) => line.name === 'Health bar restored')?.value, '+10 Hit Points');

    // Fire hurt it: the game master spends its regeneration
    await setDamage(trollId, 'regeneration', 1);
    assert.equal(await runTurnEvent(trollId, 'turnStart'), 'silent', 'no line: it did not regenerate');
    assert.equal((await prop(trollId, 'hitPoints')).damage, 20, 'no hit point back');
    assert.equal((await prop(trollId, 'regeneration')).damage, 0, 'back after its trigger read it');

    assert.equal(await runTurnEvent(trollId, 'turnStart'), 'logged');
    assert.equal((await prop(trollId, 'hitPoints')).damage, 10, 'it regenerates again');
  });

  /*
   * The troll's own damage trigger, when another creature's action hurts it
   * (2.1's received damage): fire spends its regeneration, a sword does not.
   * Its regeneration then holds, or not, at the start of its next turn
   */
  it('stops a troll\'s regeneration when another creature\'s fire hurts it, never its sword', async function () {
    const [ownerId, mageId, fireId, swordId] = getRandomIds(4);
    const execute = (method: unknown, args: unknown): Promise<any> =>
      (method as { _execute(invocation: { userId: string }, args: unknown): Promise<any> })._execute({ userId: ownerId }, args);
    await Meteor.users.rawCollection().insertOne({ _id: ownerId, createdAt: new Date(), username: `turns-${ownerId}` } as any);
    try {
      await createTestCreature({
        _id: mageId, name: 'Mage', owner: ownerId, props: [
          { _id: fireId, type: 'damage', target: 'target', damageType: 'fire', amount: { calculation: '5' } },
          { _id: swordId, type: 'damage', target: 'target', damageType: 'slashing', amount: { calculation: '5' } },
        ] as ForestProp[],
      });
      const [trollId] = getRandomIds(1);
      await createTestCreature({ _id: trollId, name: 'Troll', owner: ownerId, type: 'monster', props: [...trollProps(30), ...blockProps()] });
      const hit = async (propId: string) => {
        const actionId = await execute(insertAction, { action: { creatureId: mageId, task: { prop: { _id: propId }, targetIds: [trollId] }, results: [], taskCount: 0 } });
        await execute(runAction, { actionId, decisions: [] });
        await reloadCachedProperties(trollId);
      };

      await hit(swordId);
      assert.equal((await prop(trollId, 'hitPoints')).damage, 35);
      assert.equal((await prop(trollId, 'regeneration')).damage || 0, 0, 'a sword stops nothing');
      assert.equal(await runTurnEvent(trollId, 'turnStart'), 'logged');
      assert.equal((await prop(trollId, 'hitPoints')).damage, 25, 'it regenerates');

      await hit(fireId);
      assert.equal((await prop(trollId, 'hitPoints')).damage, 30);
      assert.equal((await prop(trollId, 'regeneration')).damage, 1, 'fire spent its regeneration');
      const received = (await logsOf(trollId)).at(-1);
      assert.include(received.content.map((line: any) => line.name), 'Regeneration stopped', 'in its own log, its game master\'s');
      assert.equal(await runTurnEvent(trollId, 'turnStart'), 'silent', 'no hit point back, its regeneration back');
      assert.equal((await prop(trollId, 'hitPoints')).damage, 30);
      assert.equal((await prop(trollId, 'regeneration')).damage, 0);
      // And the mage's own entry says nothing of it
      assert.notInclude(JSON.stringify(await logsOf(mageId)), 'Regeneration stopped');
    } finally {
      await Meteor.users.removeAsync(ownerId);
    }
  });

  it('heals nothing at full hit points, and logs nothing', async function () {
    const trollId = await creature('Troll', trollProps(0));
    assert.equal(await runTurnEvent(trollId, 'turnStart'), 'unchanged');
    assert.lengthOf(await logsOf(trollId), 0);
  });

  it('regenerates a troll at 0 hit points, never an oni', async function () {
    const trollId = await creature('Troll', trollProps(84));
    assert.equal(await runTurnEvent(trollId, 'turnStart'), 'logged');
    assert.equal((await prop(trollId, 'hitPoints')).damage, 74);
    const oniId = await creature('Oni', oniProps(110));
    assert.equal(await runTurnEvent(oniId, 'turnStart'), 'unchanged', 'it needs a hit point left');
    assert.equal((await prop(oniId, 'hitPoints')).damage, 110);
    // Hurt, it regenerates
    await setDamage(oniId, 'hitPoints', 50);
    assert.equal(await runTurnEvent(oniId, 'turnStart'), 'logged');
    assert.equal((await prop(oniId, 'hitPoints')).damage, 40);
  });
});
