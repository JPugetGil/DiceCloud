import { buildComputationFromProps } from '/imports/api/engine/computation/buildCreatureComputation';
import { assert } from 'chai';
import computeCreatureComputation from '../../computeCreatureComputation';
import propsFromForest from '/imports/api/engine/computation/utility/propsFromForest.testFn';

export default async function () {
  const computation = buildComputationFromProps(testProperties);
  await computeCreatureComputation(computation);
  const prop = id => computation.propsById[id];
  assert.equal(prop('strengthId').value, 11, 'Point buys should apply a base value when active');
  // 15 costs 7 + 2, 14 costs 6 + 1, 8 costs nothing, the empty row is skipped
  const costed = prop('costedPointBuy');
  assert.deepEqual(costed.values.map(row => row.spent), [9, 0, 7, 0], 'Each row should be costed');
  assert.equal(costed.spent, 16, 'Point buys should total what their rows cost');
  assert.equal(costed.pointsLeft, 11, 'Point buys should subtract what was spent from the total');
}

var testProperties = propsFromForest([
  {
    _id: 'strengthId',
    variableName: 'strength',
    type: 'attribute',
    attributeType: 'ability',
    baseValue: {
      calculation: '8'
    },
  }, {
    // calculated inactive toggle with point buy under it
    // It should not impact the ability score
    type: 'toggle',
    condition: { calculation: 'false' },
    children: [
      {
        _id: 'inactivePointBuy',
        type: 'pointBuy',
        values: [{ variableName: 'strength', value: 13 }],
      }
    ]
  }, {
    type: 'pointBuy',
    values: [{ variableName: 'strength', value: 11 }],
  }, {
    _id: 'costedPointBuy',
    type: 'pointBuy',
    cost: { calculation: 'max(value-8, 0) + max(value-13, 0)' },
    total: { calculation: '27' },
    values: [
      { variableName: 'costedStrength', value: 15 },
      { variableName: 'costedDexterity' },
      { variableName: 'costedConstitution', value: 14 },
      { variableName: 'costedIntelligence', value: 8 },
    ],
  }
]);
