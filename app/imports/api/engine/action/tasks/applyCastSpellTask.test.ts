import { assert } from 'chai';
import type { TestCreature } from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import {
  allLogContent,
  allUpdates,
  createTestCreature,
  getRandomIds,
  removeAllCreaturesAndProps,
  runTask,
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';

// Casting a spell: with a slot, which it spends and whose level it casts at,
// at its own level without one, as a ritual; and what it says when it cannot
const [creatureId, spellId, slotId, kiId] = getRandomIds(4);

const creature: TestCreature = {
  _id: creatureId,
  props: [
    {
      _id: spellId, type: 'spell', name: 'Shield', level: 1, target: 'self',
      children: [{ type: 'note', name: 'Slot', summary: { text: 'Cast at {slotLevel}' } }],
    },
    {
      _id: slotId, type: 'attribute', name: 'Level 2 slots', attributeType: 'spellSlot',
      variableName: 'slotLevel2', spellSlotLevel: { calculation: '2' }, baseValue: { calculation: '3' },
    },
    {
      _id: kiId, type: 'attribute', name: 'Ki', attributeType: 'resource',
      variableName: 'ki', baseValue: { calculation: '3' },
    },
  ],
};

async function cast(params: object, prop?: unknown) {
  const spell = prop === undefined ? await CreatureProperties.findOneAsync(spellId) : prop;
  return runTask(creatureId, {
    subtaskFn: 'castSpell', targetIds: [], prop: spell,
    params: { slotId: undefined, ritual: false, withoutSpellSlot: false, ...params },
  });
}
const lines = (action: Awaited<ReturnType<typeof cast>>) =>
  allLogContent(action).map(({ name, value }) => [name, value].filter(Boolean).join(': '));

describe('Cast a spell', function () {
  this.timeout(8000);

  before(async function () {
    await removeAllCreaturesAndProps();
    await createTestCreature(creature);
  });

  it('spends the slot and casts at its level', async function () {
    const action = await cast({ slotId });
    assert.deepEqual(allUpdates(action).map(update => [update.propId, update.inc]), [[slotId, { damage: 1, value: -1 }]]);
    const log = lines(action);
    assert.include(log, 'Casting using a level 2 spell slot');
    // The spell's own properties read the level it is cast at
    assert.include(log, 'Slot: Cast at 2');
  });

  it('casts at its own level without a slot, and as a ritual, spending nothing', async function () {
    for (const [params, line] of [
      [{ withoutSpellSlot: true }, 'Casting at level 1'],
      [{ ritual: true }, 'Ritual casting at level 1'],
    ] as const) {
      const action = await cast(params);
      assert.deepEqual(allUpdates(action), [], line);
      assert.include(lines(action), line);
    }
  });

  it('says why it cannot cast: no slot, a slot that is none, no spell', async function () {
    for (const [params, prop, reason] of [
      [{}, undefined, 'The chosen spell requires a spell slot to cast'],
      [{ slotId: kiId }, undefined, 'The chosen slot was not actually a spell slot'],
      [{ withoutSpellSlot: true }, null, 'The chosen spell was not found'],
    ] as const) {
      const action = await cast(params, prop);
      assert.deepEqual(lines(action), [`Error casting spell: ${reason}`]);
      assert.deepEqual(allUpdates(action), [], reason);
    }
  });
});
