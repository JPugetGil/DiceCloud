import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import writeActionResults from '/imports/api/engine/action/functions/writeActionResults';
import type { EngineAction } from '/imports/api/engine/action/EngineActions';
import type {
  TestCreature
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import {
  allMutations,
  createTestCreature,
  getRandomIds,
  removeAllCreaturesAndProps,
  runActionById
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';

const [
  creatureId, otherCreatureId, buffId, removeParentBuffId, removeTargetBuffsId, buffEffectId,
  removeParentBuffUntargetedId, taggedCreatureId, shieldBuffId, hexBuffId, poisonedBuffId,
  removeMagicNotCurseId, removeCurseOrPoisonId, removeOrPoisonId,
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

// Buffs tagged for the removers' tags: magic, magic and curse, poison
const taggedCreature: TestCreature = {
  _id: taggedCreatureId,
  props: [
    { _id: shieldBuffId, type: 'buff', name: 'Shield of Faith', tags: ['magic'] },
    { _id: hexBuffId, type: 'buff', name: 'Hex', tags: ['magic', 'curse'] },
    { _id: poisonedBuffId, type: 'buff', name: 'Poisoned', tags: ['poison'] },
    // The removers, on the same creature: they target it
    {
      _id: removeMagicNotCurseId,
      type: 'buffRemover',
      target: 'target',
      removeAll: true,
      targetTags: ['magic'],
      extraTags: [{ _id: 'not-curse', operation: 'NOT', tags: ['curse'] }],
    },
    {
      _id: removeCurseOrPoisonId,
      type: 'buffRemover',
      target: 'target',
      removeAll: true,
      targetTags: ['curse'],
      extraTags: [{ _id: 'or-poison', operation: 'OR', tags: ['poison'] }],
    },
    // No tag required, an OR group: those of the group alone, as an effect,
    // a trigger and a slot read the same query
    {
      _id: removeOrPoisonId,
      type: 'buffRemover',
      target: 'target',
      removeAll: true,
      targetTags: [],
      extraTags: [{ _id: 'or-poison-alone', operation: 'OR', tags: ['poison'] }],
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
    await createTestCreature(taggedCreature);
  });

  const removedIds = (action: EngineAction) => allMutations(action).flatMap(mutation => mutation.removals || [])
    .map(removal => removal.propId);

  it('removes the buffs with the target tags, but none with a tag of a NOT group', async function () {
    const action = await runActionById(removeMagicNotCurseId, [taggedCreatureId]);
    assert.deepEqual(removedIds(action), [shieldBuffId], 'magic, but not the cursed Hex');
  });

  it('removes the buffs with the target tags or those of an OR group', async function () {
    const action = await runActionById(removeCurseOrPoisonId, [taggedCreatureId]);
    assert.sameMembers(removedIds(action), [hexBuffId, poisonedBuffId]);
  });

  it('removes those of its OR groups alone when it requires no tag, as effects read it', async function () {
    const action = await runActionById(removeOrPoisonId, [taggedCreatureId]);
    assert.sameMembers(removedIds(action), [poisonedBuffId], 'not every buff');
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
