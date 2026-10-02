import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import writeActionResults from '/imports/api/engine/action/functions/writeActionResults';
import {
  allMutations,
  createTestCreature,
  getRandomIds,
  removeAllCreaturesAndProps,
  runActionById,
  TestCreature
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';

const [
  creatureId, otherCreatureId, buffId, removeParentBuffId, removeTargetBuffsId, buffEffectId,
  removeParentBuffUntargetedId,
] = getRandomIds(100);

const actionTestCreature: TestCreature = {
  _id: creatureId,
  props: [
    {
      _id: buffId,
      type: 'buff',
      description: { text: 'This buff reduces AC of target by difference between the strength of caster {strength} and the target {~target.strength}' },
      tags: ['some buff'],
      children: [
        {
          _id: buffEffectId,
          type: 'effect',
          stats: ['armor'],
          operation: 'add',
          amount: { calculation: '~target.strength - strength' },
        },
        {
          _id: removeParentBuffId,
          type: 'buffRemover',
          targetParentBuff: true,
          target: 'self',
        },
        {
          _id: removeParentBuffUntargetedId,
          type: 'buffRemover',
          targetParentBuff: true,
          target: 'target',
        },
      ],
    },
    {
      type: 'attribute',
      attributeType: 'stat',
      variableName: 'strength',
      baseValue: { calculation: '18' },
    },
  ],
};

const actionOtherCreature: TestCreature = {
  _id: otherCreatureId,
  props: [
    {
      _id: removeTargetBuffsId,
      type: 'buffRemover',
      target: 'target',
      targetTags: ['some buff']
    },
  ],
};

describe('Apply Buff Remover Properties', function () {
  // Increase timeout
  this.timeout(8000);

  beforeEach(async function () {
    await removeAllCreaturesAndProps();
    await createTestCreature(actionTestCreature);
    await createTestCreature(actionOtherCreature);
  });

  it('removes a parent buff', async function () {
    const action = await runActionById(removeParentBuffId);
    const mutations = allMutations(action);
    assert.deepEqual(mutations, [{
      contents: [{
        name: 'Removed',
        value: 'Buff',
      }],
      removals: [{
        propId: buffId,
      }],
      targetIds: []
    }]);
  });

  it('removes its parent buff when run without targets', async function () {
    const action = await runActionById(removeParentBuffUntargetedId);
    const mutations = allMutations(action);
    assert.deepEqual(mutations.flatMap(mutation => mutation.removals || []), [{
      propId: buffId,
    }]);
  });

  it('removes the buff and what is under it from the sheet', async function () {
    if (!Meteor.isServer) this.skip();
    const action = await runActionById(removeParentBuffId);
    await writeActionResults(action);
    const buff = await CreatureProperties.findOneAsync(buffId);
    const effect = await CreatureProperties.findOneAsync(buffEffectId);
    assert.isTrue(buff?.removed, 'the buff is removed');
    assert.isTrue(effect?.removed, 'its effect is removed with it');
    assert.equal(effect?.removedWith, buffId, 'and restored with it');
  });

  it('removes a tag targeted buff', async function () {
    const action = await runActionById(removeTargetBuffsId, [creatureId]);
    const mutations = allMutations(action);
    assert.deepEqual(mutations, [{
      contents: [{
        name: 'Removed',
        value: 'Buff',
      }],
      removals: [{
        propId: buffId,
      }],
      targetIds: [creatureId]
    }]);
  });
});
