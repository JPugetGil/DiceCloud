import { assert } from 'chai';
import {
  allMutations, allUpdates, createTestCreature, getRandomIds, removeAllCreaturesAndProps, runActionById,
  type TestCreature,
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import type { ForestProp } from '/imports/api/engine/computation/utility/propsFromForest.testFn';

/*
 * The type of the damage a creature takes, in its damage triggers' scope:
 * `~damageType`, "if the troll takes acid or fire damage" (phase 3.4). And an
 * `extra` damage after another in the same action takes that one's type
 * (`~lastDamageType`), resistances included: it never did, the type being
 * written to a copy of the scope that the next damage did not read.
 */

const [
  casterId, burnId, extraId, targetId, targetHpId, selfId, selfFireId, selfSlashId, selfHealId,
] = getRandomIds(9);

const hitPoints = (_id?: string): ForestProp => ({
  ...(_id && { _id }), type: 'attribute', name: 'Hit Points', attributeType: 'healthBar', variableName: 'hitPoints',
  baseValue: { calculation: '100' }, tags: ['hitPoints'],
} as any);

const caster: TestCreature = {
  _id: casterId, name: 'Mage',
  props: [
    // Fire, then extra damage of the same type
    {
      _id: burnId, type: 'action', name: 'Searing Smite', target: 'singleTarget',
      children: [
        { type: 'damage', target: 'target', damageType: 'fire', amount: { calculation: '10' } },
        { type: 'damage', target: 'target', damageType: 'extra', amount: { calculation: '4' } },
      ],
    } as any,
    // Extra damage with nothing before it: no type to take
    { _id: extraId, type: 'damage', target: 'target', damageType: 'extra', amount: { calculation: '4' } } as any,
  ],
};

const target: TestCreature = {
  _id: targetId, name: 'Fire elemental',
  props: [
    hitPoints(targetHpId),
    { type: 'damageMultiplier', name: 'Fire resistance', damageTypes: ['fire'], value: 0.5 } as any,
  ],
};

// A creature whose own damage triggers read the type of the damage it deals itself
const burner: TestCreature = {
  _id: selfId, name: 'Troll',
  props: [
    hitPoints(),
    {
      type: 'trigger', name: 'Burnt', event: 'damageProperty', timing: 'after', targetTags: ['hitPoints'],
      condition: { calculation: '~damageType == \'acid\' || ~damageType == \'fire\'' },
      description: { text: 'took {~damage} {~damageType}' },
    } as any,
    { _id: selfFireId, type: 'damage', target: 'self', damageType: 'fire', amount: { calculation: '3' } } as any,
    { _id: selfSlashId, type: 'damage', target: 'self', damageType: 'slashing', amount: { calculation: '3' } } as any,
    { _id: selfHealId, type: 'damage', target: 'self', damageType: 'healing', amount: { calculation: '2' } } as any,
  ],
};

const lines = (action: Awaited<ReturnType<typeof runActionById>>) => allMutations(action).flatMap(m => m.contents || []);
const dealt = (action: Awaited<ReturnType<typeof runActionById>>, propId: string) => allUpdates(action)
  .filter(update => update.propId === propId).reduce((total, update) => total + (update.inc?.damage || 0), 0);

describe('The type of the damage', function () {
  this.timeout(20000);

  before(async function () {
    await removeAllCreaturesAndProps();
    for (const creature of [caster, target, burner]) await createTestCreature(creature);
  });

  after(removeAllCreaturesAndProps);

  it('gives an extra damage the type of the damage before it in the action, resistances included', async function () {
    const action = await runActionById(burnId, [targetId]);
    // A character's lines: its resistance, then its hit points
    const damages = lines(action).filter(line => line.name === 'Damage').map(line => line.value);
    assert.deepEqual(damages, ['Resistant to fire damage', 'Resistant to fire damage'], JSON.stringify(lines(action)));
    assert.equal(dealt(action, targetHpId), 5 + 2, '10 fire halved, then 4 more fire halved');
  });

  it('leaves an extra damage with nothing before it as it is', async function () {
    const action = await runActionById(extraId, [targetId]);
    assert.equal(dealt(action, targetHpId), 4);
  });

  it('tells a creature\'s own damage triggers the type of the damage it takes', async function () {
    const fire = await runActionById(selfFireId, []);
    const burnt = lines(fire).find(line => line.name === 'Burnt');
    assert.exists(burnt, JSON.stringify(lines(fire)));
    assert.equal(burnt!.value, 'took 3 fire');
    const slash = await runActionById(selfSlashId, []);
    assert.notExists(lines(slash).find(line => line.name === 'Burnt'), 'slashing: its condition does not hold');
  });

  it('says healing for healing, which no damage trigger takes for a damage type', async function () {
    const heal = await runActionById(selfHealId, []);
    assert.notExists(lines(heal).find(line => line.name === 'Burnt'));
  });
});
