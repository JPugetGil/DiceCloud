import { assert } from 'chai';
import {
  allLogContent,
  allUpdates,
  createTestCreature,
  getRandomIds,
  removeAllCreaturesAndProps,
  runTask,
  TestCreature
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import { concentrationDc } from '/imports/api/engine/action/tasks/applyDealDamageTask';
import type { EngineAction } from '/imports/api/engine/action/EngineActions';

const [creatureId, hitPointsId, tempId, concentratingId, concentratingHpId, resistantId, resistantHpId] = getRandomIds(7);

// Temporary hit points take damage first, as the health bars' order says
const creature: TestCreature = {
  _id: creatureId,
  props: [
    {
      _id: tempId,
      type: 'attribute',
      name: 'Temporary Hit Points',
      attributeType: 'healthBar',
      variableName: 'tempHP',
      baseValue: { calculation: '5' },
      healthBarDamageOrder: -1,
      healthBarNoHealing: true,
    },
    {
      _id: hitPointsId,
      type: 'attribute',
      name: 'Hit Points',
      attributeType: 'healthBar',
      variableName: 'hitPoints',
      baseValue: { calculation: '20' },
    },
  ],
};

const concentrating: TestCreature = {
  _id: concentratingId,
  props: [
    {
      _id: concentratingHpId,
      type: 'attribute',
      name: 'Hit Points',
      attributeType: 'healthBar',
      variableName: 'hitPoints',
      baseValue: { calculation: '30' },
    },
    { type: 'toggle', name: 'Concentration', variableName: 'concentration', enabled: true },
  ],
};

// Resists fire, is immune to cold and vulnerable to lightning, and resists
// slashing unless it is magical
const resistant: TestCreature = {
  _id: resistantId,
  props: [
    {
      _id: resistantHpId,
      type: 'attribute',
      name: 'Hit Points',
      attributeType: 'healthBar',
      variableName: 'hitPoints',
      baseValue: { calculation: '100' },
    },
    { type: 'damageMultiplier', damageTypes: ['fire'], value: 0.5 },
    { type: 'damageMultiplier', damageTypes: ['cold'], value: 0 },
    { type: 'damageMultiplier', damageTypes: ['lightning'], value: 2 },
    { type: 'damageMultiplier', damageTypes: ['slashing'], value: 0.5, excludeTags: ['magical'] },
    { type: 'damageMultiplier', damageTypes: ['radiant'], value: 2, includeTags: ['sunlight'] },
  ],
};

const dealDamage = (target: string, amount: number, damageType?: string) => runTask(target, {
  subtaskFn: 'dealDamage',
  targetIds: [target],
  params: { amount, damageType },
});

describe('Apply Deal Damage Task (the health bar\'s Damage and Healing)', function () {
  this.timeout(8000);

  before(async function () {
    await removeAllCreaturesAndProps();
    await createTestCreature(creature);
    await createTestCreature(concentrating);
    await createTestCreature(resistant);
  });

  it('Damages temporary hit points first', async function () {
    const action = await dealDamage(creatureId, 8, 'slashing');
    assert.deepEqual(allUpdates(action).map(update => [update.propId, update.inc]), [
      [tempId, { damage: 5, value: -5 }],
      [hitPointsId, { damage: 3, value: -3 }],
    ]);
  });

  it('Logs the damage with its type, in English and as a message', async function () {
    const action = await dealDamage(creatureId, 4, 'fire');
    const [line] = allLogContent(action, { withMessages: true });
    assert.equal(line.name, 'Damage');
    assert.equal(line.value, '**4** fire damage');
    assert.deepEqual(line.i18n, {
      name: { key: 'logs.damage' },
      value: [{ key: 'logs.damageAmount', params: { amount: 4, type: { key: 'damageTypes.fire', fallback: 'fire' } } }],
    });
  });

  it('Heals hit points, not temporary ones', async function () {
    const action = await dealDamage(creatureId, 4, 'healing');
    assert.equal(allLogContent(action)[0].value, '**4** healing');
    // Nothing to heal on a creature at full health: no update
    assert.isTrue(allUpdates(action).every(update => update.propId === hitPointsId));
  });

  it('Does nothing for no amount', async function () {
    const action = await dealDamage(creatureId, 0);
    assert.deepEqual(allLogContent(action), []);
  });

  it('Reminds a concentrating creature of its saving throw', async function () {
    const action = await dealDamage(concentratingId, 26);
    const lines = allLogContent(action);
    assert.equal(lines[0].value, '**26** damage');
    const reminder = lines[lines.length - 1];
    assert.equal(reminder.name, 'Concentration');
    assert.include(reminder.value, 'DC **13**');
    assert.equal(concentrationDc(5), 10);
  });

  describe('Immunities, resistances and vulnerabilities', function () {
    const damageDealt = (action: EngineAction) => allUpdates(action)
      .reduce((total, update) => total + (update.inc?.damage || 0), 0);

    it('halves damage the creature resists, rounding down, and says so', async function () {
      const action = await dealDamage(resistantId, 9, 'fire');
      assert.equal(allLogContent(action)[0].value, '**4** fire damage\nResistant to fire damage');
      assert.deepEqual(allUpdates(action).map(update => [update.propId, update.inc]), [
        [resistantHpId, { damage: 4, value: -4 }],
      ]);
    });

    it('deals no damage the creature is immune to', async function () {
      const action = await dealDamage(resistantId, 9, 'cold');
      assert.equal(allLogContent(action)[0].value, '**0** cold damage\nImmune to cold damage');
      assert.deepEqual(allUpdates(action), []);
    });

    it('doubles damage the creature is vulnerable to', async function () {
      const action = await dealDamage(resistantId, 9, 'lightning');
      assert.equal(allLogContent(action)[0].value, '**18** lightning damage\nVulnerable to lightning damage');
      assert.equal(damageDealt(action), 18);
    });

    it('applies a multiplier that excludes tags, not one that requires them: typed damage has none', async function () {
      assert.equal(damageDealt(await dealDamage(resistantId, 9, 'slashing')), 4);
      assert.equal(damageDealt(await dealDamage(resistantId, 9, 'radiant')), 9);
    });

    it('leaves other types, untyped damage and healing alone', async function () {
      const acid = await dealDamage(resistantId, 9, 'acid');
      assert.equal(allLogContent(acid)[0].value, '**9** acid damage');
      assert.equal(damageDealt(acid), 9);
      assert.equal(damageDealt(await dealDamage(resistantId, 9)), 9);
    });
  });
});
