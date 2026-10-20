import { assert } from 'chai';
import type {
  TestCreature
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import {
  allLogContent,
  allMutations,
  createTestCreature,
  getRandomIds,
  removeAllCreaturesAndProps,
  runActionById
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';

const [
  creatureId, targetCreatureId, targetCreature2Id, adjustmentToTargetId, adjustmentToSelfId, targetCreatureStrengthId, targetCreature2StrengthId, selfDexterityId,
  adjustmentToSkillId, targetCreatureAthleticsId,
] = getRandomIds(100);

const actionTestCreature: TestCreature = {
  _id: creatureId,
  props: [
    {
      _id: adjustmentToTargetId,
      type: 'adjustment',
      target: 'target',
      stat: 'strength',
      operation: 'increment',
      amount: { calculation: '2' }
    },
    {
      _id: adjustmentToSelfId,
      type: 'adjustment',
      target: 'self',
      stat: 'dexterity',
      operation: 'set',
      amount: { calculation: '11' }
    },
    {
      _id: adjustmentToSkillId,
      type: 'adjustment',
      target: 'target',
      stat: 'athletics',
      operation: 'increment',
      amount: { calculation: '2' }
    },
    {
      _id: selfDexterityId,
      type: 'attribute',
      name: 'Dexterity',
      attributeType: 'ability',
      variableName: 'dexterity',
      baseValue: { calculation: '13' },
    },
  ],
}

const actionTargetCreature: TestCreature = {
  _id: targetCreatureId,
  props: [
    {
      _id: targetCreatureStrengthId,
      type: 'attribute',
      attributeType: 'ability',
      variableName: 'strength',
      baseValue: { calculation: '12' },
    },
    {
      _id: targetCreatureAthleticsId,
      type: 'skill',
      skillType: 'skill',
      variableName: 'athletics',
      ability: 'strength',
    },
  ]
}

const actionTargetCreature2: TestCreature = {
  _id: targetCreature2Id,
  props: [
    {
      _id: targetCreature2StrengthId,
      type: 'attribute',
      attributeType: 'ability',
      variableName: 'strength',
      baseValue: { calculation: '18' },
    }
  ]
}

describe('Apply Adjustment Properties', function () {
  // Increase timeout
  this.timeout(8000);

  before(async function () {
    await removeAllCreaturesAndProps();
    await createTestCreature(actionTestCreature);
    await createTestCreature(actionTargetCreature);
    await createTestCreature(actionTargetCreature2);
  });

  it('Adjusts the attributes of self', async function () {
    const action = await runActionById(adjustmentToSelfId);
    assert.exists(action);
    assert.deepEqual(allMutations(action), [{
      contents: [
        {
          inline: true,
          name: 'Attribute damage',
          value: 'Dexterity set from 13 to 11',
        }
      ],
      targetIds: [creatureId],
      updates: [
        {
          propId: selfDexterityId,
          type: 'attribute',
          set: { damage: 2, value: 11 },
        },
      ],
    }]);
  });

  it('Adjusts the attributes of a single target', async function () {
    const action = await runActionById(adjustmentToTargetId, [targetCreatureId]);
    assert.exists(action);
    assert.deepEqual(allMutations(action), [{
      contents: [
        {
          inline: true,
          name: 'Ability score damaged',
          value: '−2 Attribute',
        }
      ],
      targetIds: [targetCreatureId],
      updates: [
        {
          propId: targetCreatureStrengthId,
          type: 'attribute',
          inc: { damage: 2, value: -2 },
        },
      ],
    }]);
  });

  it('Adjusts the attributes of multiple targets', async function () {
    const action = await runActionById(adjustmentToTargetId, [
      targetCreatureId, targetCreature2Id
    ]);
    assert.exists(action);
    assert.deepEqual(allMutations(action), [{
      contents: [
        {
          inline: true,
          name: 'Ability score damaged',
          value: '−2 Attribute',
        }
      ],
      targetIds: [targetCreatureId],
      updates: [
        {
          propId: targetCreatureStrengthId,
          type: 'attribute',
          inc: { damage: 2, value: -2 },
        },
      ],
    }, {
      contents: [
        {
          inline: true,
          name: 'Ability score damaged',
          value: '−2 Attribute',
        }
      ],
      targetIds: [targetCreature2Id],
      updates: [
        {
          propId: targetCreature2StrengthId,
          type: 'attribute',
          inc: { damage: 2, value: -2 },
        },
      ],
    }]);
  });

  // A skill has no damage to take: the task wrote `damage` and `value` on it,
  // and logged an attribute type of `undefined`
  it('Refuses a stat that is not an attribute, and writes nothing', async function () {
    const action = await runActionById(adjustmentToSkillId, [targetCreatureId]);
    assert.exists(action);
    const updates = allMutations(action).flatMap(mutation => mutation.updates ?? []);
    assert.deepEqual(updates, [], 'nothing written');
    assert.include(
      allLogContent(action).map(line => line.value).join('\n'),
      'Could not apply attribute damage, `athletics` is not an attribute',
    );
  });
});
