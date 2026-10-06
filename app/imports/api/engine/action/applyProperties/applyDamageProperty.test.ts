import { assert } from 'chai';
import {
  allMutations,
  createTestCreature,
  getRandomIds,
  removeAllCreaturesAndProps,
  runActionById,
  TestCreature
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import { critInputProvider } from '../functions/userInput/inputProviderForTests.testFn';
import type { EngineAction } from '/imports/api/engine/action/EngineActions';

const [
  creatureId, targetCreatureId, targetCreature2Id, damageTargetId, damageSelfId, targetCreatureHitPointsId, targetCreature2HitPointsId, selfHitPointsId, damageWithEffectsId, effectId, effect2Id,
] = getRandomIds(20);

const actionTestCreature: TestCreature = {
  _id: creatureId,
  props: [
    {
      _id: damageTargetId,
      type: 'damage',
      target: 'target',
      amount: { calculation: '2d6 + 7' }
    },
    {
      _id: damageSelfId,
      type: 'damage',
      target: 'self',
      amount: { calculation: '1d12 + 7' }
    },
    {
      _id: selfHitPointsId,
      type: 'attribute',
      name: 'Hit Points',
      attributeType: 'healthBar',
      variableName: 'hitPoints',
      baseValue: { calculation: '20' },
    },
    {
      _id: damageWithEffectsId,
      type: 'damage',
      target: 'target',
      amount: { calculation: '1d13 + 3' },
      tags: ['tag']
    },
    {
      _id: effectId,
      type: 'effect',
      operation: 'add',
      amount: { calculation: '1' },
      targetByTags: true,
      targetTags: ['tag'],
    },
    {
      _id: effect2Id,
      type: 'effect',
      operation: 'mul',
      amount: { calculation: '2' },
      targetByTags: true,
      targetTags: ['tag'],
    },
  ],
}

const actionTargetCreature: TestCreature = {
  _id: targetCreatureId,
  props: [
    {
      _id: targetCreatureHitPointsId,
      type: 'attribute',
      name: 'Hit Points',
      attributeType: 'healthBar',
      variableName: 'hitPoints',
      baseValue: { calculation: '33' },
    }
  ]
}

const actionTargetCreature2: TestCreature = {
  _id: targetCreature2Id,
  props: [
    {
      _id: targetCreature2HitPointsId,
      type: 'attribute',
      name: 'Hit Points',
      attributeType: 'healthBar',
      variableName: 'hitPoints',
      baseValue: { calculation: '47' },
    }
  ]
}

describe('Apply Damage Properties', function () {
  // Increase timeout
  this.timeout(8000);

  before(async function () {
    await removeAllCreaturesAndProps();
    await createTestCreature(actionTestCreature);
    await createTestCreature(actionTargetCreature);
    await createTestCreature(actionTargetCreature2);
  });

  it('Damages self', async function () {
    const action = await runActionById(damageSelfId);
    assert.exists(action);
    assert.deepEqual(allMutations(action), [{
      contents: [
        {
          inline: true,
          name: 'Damage',
          value: '1d12 [6] + 7',
        }
      ],
      targetIds: [creatureId],
    }, {
      contents: [{
        inline: true,
        name: 'Health bar damaged',
        value: '−13 Hit Points',
      }],
      updates: [
        {
          propId: selfHitPointsId,
          type: 'attribute',
          inc: { damage: 13, value: -13 },
        },
      ],
      targetIds: [creatureId],
    }]);
  });

  it('Damages a single target', async function () {
    const action = await runActionById(damageTargetId, [targetCreatureId]);
    assert.exists(action);
    assert.deepEqual(allMutations(action), [{
      contents: [
        {
          inline: true,
          name: 'Damage',
          value: '2d6 [3, 4] + 7',
        }
      ],
      targetIds: [targetCreatureId],
    }, {
      contents: [
        {
          inline: true,
          name: 'Health bar damaged',
          value: '−14 Hit Points',
        }
      ],
      targetIds: [targetCreatureId],
      updates: [
        {
          propId: targetCreatureHitPointsId,
          type: 'attribute',
          inc: { damage: 14, value: -14 },
        },
      ],
    }]);
  });

  it('Damages multiple targets', async function () {
    const action = await runActionById(damageTargetId, [
      targetCreatureId, targetCreature2Id
    ]);
    assert.exists(action);
    assert.deepEqual(allMutations(action), [{
      contents: [
        {
          inline: true,
          name: 'Damage',
          value: '2d6 [3, 4] + 7',
        }
      ],
      targetIds: [
        targetCreatureId,
        targetCreature2Id,
      ],
    }, {
      contents: [
        {
          inline: true,
          name: 'Health bar damaged',
          value: '−14 Hit Points',
        }
      ],
      targetIds: [targetCreatureId],
      updates: [
        {
          propId: targetCreatureHitPointsId,
          type: 'attribute',
          inc: { damage: 14, value: -14 },
        },
      ],
    }, {
      contents: [
        {
          inline: true,
          name: 'Health bar damaged',
          value: '−14 Hit Points',
        }
      ],
      targetIds: [targetCreature2Id],
      updates: [
        {
          propId: targetCreature2HitPointsId,
          type: 'attribute',
          inc: { damage: 14, value: -14 },
        },
      ],
    }]);
  });

  it('Applies effects when doing damage', async function () {
    const action = await runActionById(damageWithEffectsId, [targetCreatureId]);
    assert.exists(action);
    assert.deepEqual(allMutations(action), [{
      contents: [
        {
          inline: true,
          name: 'Damage',
          value: '(1d13 [7] + 4) * 2',
        }
      ],
      targetIds: [targetCreatureId],
    }, {
      contents: [
        {
          inline: true,
          name: 'Health bar damaged',
          value: '−22 Hit Points',
        }
      ],
      targetIds: [targetCreatureId],
      updates: [
        {
          propId: targetCreatureHitPointsId,
          type: 'attribute',
          inc: { damage: 22, value: -22 },
        },
      ],
    }]);
  });

  it('Doubles damage on a critical hit', async function () {
    const [
      creatureId, damageId, actionId
    ] = getRandomIds(3);
    const testCreature: TestCreature = {
      _id: creatureId,
      props: [
        {
          _id: actionId,
          type: 'action',
          attackRoll: { calculation: '10' },
          children: [
            {
              _id: damageId,
              type: 'damage',
              target: 'target',
              amount: { calculation: '2d6 + 7' }
            },
          ]
        },
      ],
    };
    await createTestCreature(testCreature);

    const action = await runActionById(actionId, [], critInputProvider);
    assert.exists(action);
    assert.deepEqual(allMutations(action), [{
      'contents': [{ 'name': 'Action' }],
      'targetIds': []
    }, {
      'contents': [{
        'inline': true,
        'name': 'Critical hit!',
        'value': '1d20 [20] + 10\n**30**'
      }],
      'targetIds': [],
    }, {
      'contents': [{
        'inline': true,
        'name': 'Damage',
        'value': '2d6 [3, 4, 5, 6] + 7\n**25** critical slashing damage',
      }],
      'targetIds': [],
    }]);
  });
});

describe('Apply Damage Properties: immunities, resistances and vulnerabilities', function () {
  this.timeout(8000);

  const [attackerId, defenderId, defenderHpId, attackerHpId] = getRandomIds(4);
  // A damage property per case, dealing 9 of a type to the target, with tags
  const damages: Record<string, { damageType: string, tags?: string[], target?: 'self' | 'target' }> = {
    fire: { damageType: 'fire' },
    cold: { damageType: 'cold' },
    lightning: { damageType: 'lightning' },
    thunder: { damageType: 'thunder' },
    slashing: { damageType: 'slashing' },
    magicalSlashing: { damageType: 'slashing', tags: ['magical'] },
    radiant: { damageType: 'radiant' },
    sunlight: { damageType: 'radiant', tags: ['sunlight'] },
    fireIgnoringResistance: { damageType: 'fire', tags: ['ignore resistance'] },
    coldIgnoringImmunity: { damageType: 'cold', tags: ['ignore immunity'] },
    selfFire: { damageType: 'fire', target: 'self' },
  };
  const damageIds = Object.fromEntries(Object.keys(damages).map(name => [name, getRandomIds(1)[0]]));

  const attacker: TestCreature = {
    _id: attackerId,
    props: [
      ...Object.entries(damages).map(([name, { damageType, tags = [], target = 'target' }]) => ({
        _id: damageIds[name],
        type: 'damage' as const,
        target,
        damageType,
        tags,
        amount: { calculation: '9' },
      })),
      {
        _id: attackerHpId,
        type: 'attribute',
        name: 'Hit Points',
        attributeType: 'healthBar',
        variableName: 'hitPoints',
        baseValue: { calculation: '50' },
      },
      // Resists its own fire: a self-inflicted burn is halved too
      { type: 'damageMultiplier', name: 'Fire resistance', damageTypes: ['fire'], value: 0.5 },
    ],
  };

  const defender: TestCreature = {
    _id: defenderId,
    props: [
      {
        _id: defenderHpId,
        type: 'attribute',
        name: 'Hit Points',
        attributeType: 'healthBar',
        variableName: 'hitPoints',
        baseValue: { calculation: '100' },
      },
      { type: 'damageMultiplier', name: 'Fire resistance', damageTypes: ['fire'], value: 0.5 },
      { type: 'damageMultiplier', name: 'Cold immunity', damageTypes: ['cold'], value: 0 },
      { type: 'damageMultiplier', name: 'Lightning vulnerability', damageTypes: ['lightning'], value: 2 },
      // Resistance to nonmagical slashing: magical damage bypasses it
      {
        type: 'damageMultiplier', name: 'Nonmagical slashing resistance',
        damageTypes: ['slashing'], value: 0.5, excludeTags: ['magical'],
      },
      // Vulnerable to radiant damage only from sunlight
      {
        type: 'damageMultiplier', name: 'Sunlight sensitivity',
        damageTypes: ['radiant'], value: 2, includeTags: ['sunlight'],
      },
    ],
  };

  before(async function () {
    await removeAllCreaturesAndProps();
    await createTestCreature(attacker);
    await createTestCreature(defender);
  });

  // The damage line, if any: a constant amount logs no roll, so only the
  // multipliers give it a value
  const damageLine = (action: EngineAction) => allMutations(action)
    .flatMap(mutation => mutation.contents || [])
    .find(content => content.name === 'Damage');

  // The damage dealt to the hit points, and the damage line's text
  async function hit(name: string) {
    const action = await runActionById(damageIds[name], [defenderId]);
    const dealt = allMutations(action).flatMap(mutation => mutation.updates || [])
      .reduce((total, update) => total + (update.inc?.damage || 0), 0);
    return { dealt, value: damageLine(action)?.value, action };
  }

  it('halves damage of a type the target resists, rounding down, and says so', async function () {
    const { dealt, value } = await hit('fire');
    assert.equal(dealt, 4);
    assert.equal(value, 'Resistant to fire damage');
  });

  it('logs the resistance as a message for the reader\'s language', async function () {
    const { action } = await hit('fire');
    const [line] = allMutations(action, { withMessages: true })[0].contents || [];
    assert.deepEqual(line.i18n?.value, [
      { key: 'logs.resistant', params: { type: { key: 'damageTypes.fire', fallback: 'fire' } } },
    ]);
  });

  it('deals no damage of a type the target is immune to', async function () {
    const { dealt, value, action } = await hit('cold');
    assert.equal(dealt, 0);
    assert.equal(value, 'Immune to cold damage');
    // Nothing reaches the health bar
    assert.deepEqual(allMutations(action).flatMap(mutation => mutation.updates || []), []);
  });

  it('doubles damage of a type the target is vulnerable to', async function () {
    const { dealt, value } = await hit('lightning');
    assert.equal(dealt, 18);
    assert.equal(value, 'Vulnerable to lightning damage');
  });

  it('leaves the other damage types alone', async function () {
    const { dealt, value } = await hit('thunder');
    assert.equal(dealt, 9);
    assert.isUndefined(value);
  });

  it('skips a multiplier whose excluded tag the damage has', async function () {
    assert.equal((await hit('slashing')).dealt, 4);
    const magical = await hit('magicalSlashing');
    assert.equal(magical.dealt, 9);
    assert.isUndefined(magical.value);
  });

  it('applies a multiplier with required tags only to damage that has them all', async function () {
    assert.equal((await hit('radiant')).dealt, 9);
    const sunlight = await hit('sunlight');
    assert.equal(sunlight.dealt, 18);
    assert.equal(sunlight.value, 'Vulnerable to radiant damage');
  });

  it('honours the "ignore resistance" and "ignore immunity" tags', async function () {
    const fire = await hit('fireIgnoringResistance');
    assert.equal(fire.dealt, 9);
    assert.isUndefined(fire.value);
    const cold = await hit('coldIgnoringImmunity');
    assert.equal(cold.dealt, 9);
  });

  it('applies the acting creature\'s own resistances to damage it deals itself', async function () {
    const action = await runActionById(damageIds.selfFire);
    const mutations = allMutations(action);
    assert.equal(damageLine(action)?.value, 'Resistant to fire damage');
    assert.deepEqual(mutations.flatMap(mutation => mutation.updates || []).map(update => [update.propId, update.inc]), [
      [attackerHpId, { damage: 4, value: -4 }],
    ]);
  });
});
