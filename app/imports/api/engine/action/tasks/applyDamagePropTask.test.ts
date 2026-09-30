import { assert } from 'chai';
import {
  allUpdates,
  createTestCreature,
  getRandomIds,
  removeAllCreaturesAndProps,
  runActionById,
  TestCreature
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';

const [
  creatureId, twoHitsId, hitThenHealId, hitPointsId,
] = getRandomIds(4);

// Each damage in an action must see the attribute as the earlier ones left it
const creature: TestCreature = {
  _id: creatureId,
  props: [
    {
      _id: hitPointsId,
      type: 'attribute',
      name: 'Hit Points',
      attributeType: 'healthBar',
      variableName: 'hitPoints',
      baseValue: { calculation: '20' },
    },
    {
      _id: twoHitsId,
      type: 'action',
      actionType: 'action',
      children: [
        { type: 'damage', target: 'self', amount: { calculation: '15' } },
        { type: 'damage', target: 'self', amount: { calculation: '15' } },
      ],
    },
    {
      _id: hitThenHealId,
      type: 'action',
      actionType: 'action',
      children: [
        { type: 'damage', target: 'self', amount: { calculation: '15' } },
        { type: 'damage', target: 'self', damageType: 'healing', amount: { calculation: '10' } },
      ],
    },
  ],
};

describe('Apply Damage Prop Task', function () {
  this.timeout(8000);

  before(async function () {
    await removeAllCreaturesAndProps();
    await createTestCreature(creature);
  });

  it('Does not damage an attribute past zero over two hits', async function () {
    const action = await runActionById(twoHitsId);
    assert.deepEqual(allUpdates(action).map(update => update.inc), [
      { damage: 15, value: -15 },
      { damage: 5, value: -5 },
    ]);
  });

  it('Heals damage dealt earlier in the same action', async function () {
    const action = await runActionById(hitThenHealId);
    assert.deepEqual(allUpdates(action).map(update => update.inc), [
      { damage: 15, value: -15 },
      { damage: -10, value: 10 },
    ]);
  });
});
