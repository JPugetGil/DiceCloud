import { assert } from 'chai';
import {
  allLogContent,
  createTestCreature,
  getRandomIds,
  removeAllCreaturesAndProps,
  runActionById,
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import type { TestCreature } from '/imports/api/engine/action/functions/actionEngineTest.testFn';

// Branches without what they need (a condition, a number), an index out of
// range, and the hit and miss branches of an attack without a target, which
// say which one they are (the other tests: applyBranchProperty.test.ts)
const [creatureId, noConditionId, indexNoConditionId, indexNotNumberId, indexLowId, indexHighId, untargetedId] = getRandomIds(7);

const note = (text: string) => ({ type: 'note' as const, summary: { text } });
const threeChildren = [note('first'), note('second'), note('third')];
const creature: TestCreature = {
  _id: creatureId,
  props: [
    { _id: noConditionId, type: 'branch', branchType: 'if', children: [note('never')] },
    { _id: indexNoConditionId, type: 'branch', branchType: 'index', children: threeChildren },
    { _id: indexNotNumberId, type: 'branch', branchType: 'index', condition: { calculation: '"three"' }, children: threeChildren },
    { _id: indexLowId, type: 'branch', branchType: 'index', condition: { calculation: '-4' }, children: threeChildren },
    { _id: indexHighId, type: 'branch', branchType: 'index', condition: { calculation: '9' }, children: threeChildren },
    {
      _id: untargetedId, type: 'action', name: 'Swing', attackRoll: { calculation: '1' },
      children: [
        { type: 'branch', branchType: 'hit', children: [note('it hit')] },
        { type: 'branch', branchType: 'miss', children: [note('it missed')] },
      ],
    },
  ],
};

const lines = async (propId: string) => allLogContent(await runActionById(propId))
  .map(({ name, value }) => [name, value].filter(Boolean).join(': '));

describe('Apply Branch Properties: errors and edges', function () {
  this.timeout(8000);

  before(async function () {
    await removeAllCreaturesAndProps();
    await createTestCreature(creature);
  });

  it('says a branch lacks its condition, and runs none of its children', async function () {
    assert.deepEqual(await lines(noConditionId), ['Branch error: If branch does not have a condition set']);
    assert.deepEqual(await lines(indexNoConditionId), ['Branch error: Index branch does not have a condition set']);
  });

  it('says an index is not a number, and runs none of its children', async function () {
    assert.deepEqual(await lines(indexNotNumberId), ['Branch error: Index did not resolve into a valid number, got `three` instead']);
  });

  it('runs the first or last child of an index out of range', async function () {
    assert.deepEqual(await lines(indexLowId), ['first']);
    assert.deepEqual(await lines(indexHighId), ['third']);
  });

  it('names the hit and miss branches of an attack without a target, both run', async function () {
    const log = await lines(untargetedId);
    assert.includeMembers(log, ['**On hit**', 'it hit', '**On miss**', 'it missed']);
    assert.isBelow(log.indexOf('**On hit**'), log.indexOf('it hit'));
    assert.isBelow(log.indexOf('**On miss**'), log.indexOf('it missed'));
  });
});
