import { assert } from 'chai';
import {
  createTestCreature,
  getRandomIds,
  removeAllCreaturesAndProps,
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import EngineActions, { EngineAction } from '/imports/api/engine/action/EngineActions';
import applyAction from '/imports/api/engine/action/functions/applyAction';
import { getEffectiveActionScope } from '/imports/api/engine/action/functions/getEffectiveActionScope';
import inputProvider from '/imports/api/engine/action/functions/userInput/inputProviderForTests.testFn';

const [creatureId] = getRandomIds(1);

describe('Apply Check Task', function () {
  this.timeout(8000);

  before(async function () {
    await removeAllCreaturesAndProps();
    await createTestCreature({
      _id: creatureId,
      props: [{
        type: 'attribute',
        attributeType: 'ability',
        variableName: 'strength',
        baseValue: { calculation: '14' },
      }],
    });
  });

  // The docs promise these to the triggers that fire after a check
  it('Puts the roll in the scope of the after check triggers', async function () {
    const actionId = await EngineActions.insertAsync({
      creatureId,
      results: [],
      taskCount: 0,
      task: {
        subtaskFn: 'check',
        targetIds: [creatureId],
        abilityVariableName: 'strength',
        advantage: 0,
        dc: null,
      },
    } as EngineAction);
    const action = await EngineActions.findOneAsync(actionId);
    if (!action) throw 'Action is expected to exist';
    await applyAction(action, inputProvider, { simulate: true });

    const scope = await getEffectiveActionScope(action);
    // The test dice roller rolls 10 on a d20, and strength 14 gives +2
    assert.equal(scope['~checkDiceRoll']?.value, 10);
    assert.equal(scope['~checkModifier']?.value, 2);
    assert.equal(scope['~checkRoll']?.value, 12);
    assert.equal(scope['~checkAdvantage']?.value, 0);
  });
});
