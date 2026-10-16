import { assert } from 'chai';
import {
  allMutations,
  createTestCreature,
  getRandomIds,
  removeAllCreaturesAndProps,
  runActionById,
  TestCreature
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';

const [
  creatureId, targetCreatureId, buffId, nestedBuffId, selfBuffId,
] = getRandomIds(100);

const actionTestCreature: TestCreature = {
  _id: creatureId,
  props: [
    {
      _id: buffId,
      type: 'buff',
      description: { text: 'This buff reduces AC of target by difference between the strength of caster {strength} and the target {~target.strength}' },
      children: [
        {
          type: 'effect',
          stats: ['armor'],
          operation: 'add',
          amount: { calculation: '~target.strength - strength' },
        },
      ],
    },
    {
      type: 'attribute',
      attributeType: 'stat',
      variableName: 'strength',
      baseValue: { calculation: '18' },
    },
    // Until the end of the caster's next turn, with an effect that ends with it
    {
      _id: nestedBuffId,
      type: 'buff',
      name: 'Guiding Bolt',
      duration: { calculation: '1' },
      durationAnchor: 'source',
      durationEvent: 'turnEnd',
      children: [
        { type: 'buff', name: 'Glowing', duration: { calculation: '1' } },
        { type: 'note', name: 'Lit up' },
      ],
    },
    { _id: selfBuffId, type: 'buff', name: 'Shield', target: 'self' },
  ],
};

const actionTargetCreature: TestCreature = {
  _id: targetCreatureId,
  props: [
    {
      type: 'attribute',
      attributeType: 'stat',
      variableName: 'armor',
      baseValue: { calculation: '10' },
    },
    {
      type: 'attribute',
      attributeType: 'ability',
      variableName: 'strength',
      baseValue: { calculation: '12' },
    },
  ],
};

describe('Apply Buff Properties', function () {
  // Increase timeout
  this.timeout(8000);

  before(async function () {
    await removeAllCreaturesAndProps();
    await createTestCreature(actionTestCreature);
    await createTestCreature(actionTargetCreature);
  });

  it('Applies a buff and freezes some variables', async function () {
    const action = await runActionById(buffId, [targetCreatureId]);
    const mutations = allMutations(action);
    // Get random Ids of inserted props
    const insertedBuffId = mutations?.[1]?.inserts?.[0]?._id;
    const insertedEffectId = mutations?.[1]?.inserts?.[1]?._id;
    assert.deepEqual(mutations, [{
      contents: [{
        name: 'Buff',
        value: 'This buff reduces AC of target by difference between the strength of caster 18 and the target 12',
      }],
      targetIds: [targetCreatureId],
    }, {
      contents: [],
      inserts: [{
        _id: insertedBuffId,
        type: 'buff',
        description: {
          text: 'This buff reduces AC of target by difference between the strength of caster {18} and the target {strength}'
        },
        left: 1,
        right: 4,
        root: {
          collection: 'creatures',
          id: targetCreatureId,
        },
        tags: [],
        target: 'target',
        // Who applied it: whose turns may count it down (phase 3.5)
        appliedBy: { id: creatureId, name: 'Test Creature', collection: 'creatures' },
      }, {
        _id: insertedEffectId,
        type: 'effect',
        stats: ['armor'],
        operation: 'add',
        amount: { calculation: 'strength - 18' },
        left: 2,
        right: 3,
        parentId: insertedBuffId,
        root: {
          collection: 'creatures',
          id: targetCreatureId,
        },
        tags: [],
      }],
      targetIds: [targetCreatureId],
    }]);
  });

  it('names the creature that applied it on another creature\'s copies alone, the buffs under it too', async function () {
    // On another creature: the buff and a buff under it name the actor; the
    // other properties have no such field
    const action = await runActionById(nestedBuffId, [targetCreatureId]);
    const inserts = allMutations(action).flatMap(mutation => mutation.inserts || []);
    assert.sameMembers(inserts.map(prop => prop.type), ['buff', 'buff', 'note']);
    // Its duration's anchor and event, as the library wrote them
    assert.deepInclude(inserts[0], { name: 'Guiding Bolt', durationAnchor: 'source', durationEvent: 'turnEnd' });
    for (const prop of inserts) {
      if (prop.type === 'buff') {
        assert.deepEqual(prop.appliedBy, { id: creatureId, name: 'Test Creature', collection: 'creatures' });
      } else {
        assert.notProperty(prop, 'appliedBy');
      }
    }
    // On itself, by a target of the action or as a buff on self: none
    const onItself = await runActionById(nestedBuffId, [creatureId]);
    const selfBuff = await runActionById(selfBuffId, [targetCreatureId]);
    for (const prop of [...allMutations(onItself), ...allMutations(selfBuff)].flatMap(mutation => mutation.inserts || [])) {
      assert.equal(prop.root.id, creatureId);
      assert.notProperty(prop, 'appliedBy');
    }
  });
});
