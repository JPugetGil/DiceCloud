import { assert } from 'chai';
import type { TestCreature } from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import {
  createTestCreature,
  getRandomIds,
  removeAllCreaturesAndProps,
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';

/*
 * An effect that targets properties by tag, with no field named, changes each
 * one's main calculation (linkTypeDependencies' getDefaultCalculationField):
 * an attack's roll, a save's DC, a spell list's attack bonus, a slot's
 * expected quantity. The slot's was listed under `slot`, a type that does not
 * exist (it is `propertySlot`): such an effect left slots as they were.
 */
const [creatureId, attackId, saveId, spellListId, slotId, namedFieldSlotId] = getRandomIds(6);

const boosted = { tags: ['boosted'] };
const creature: TestCreature = {
  _id: creatureId,
  props: [
    { _id: attackId, type: 'action', name: 'Strike', attackRoll: { calculation: '3' }, ...boosted },
    { _id: saveId, type: 'savingThrow', name: 'Save', stat: 'dexterity', dc: { calculation: '12' }, ...boosted },
    { _id: spellListId, type: 'spellList', name: 'Spells', attackRollBonus: { calculation: '5' }, ...boosted },
    { _id: slotId, type: 'propertySlot', name: 'Feats', slotTags: ['feat'], quantityExpected: { calculation: '1' }, ...boosted },
    {
      _id: namedFieldSlotId, type: 'propertySlot', name: 'Other feats', slotTags: ['feat'],
      quantityExpected: { calculation: '1' }, tags: ['named'],
    },
    { type: 'effect', targetByTags: true, targetTags: ['boosted'], operation: 'add', amount: { calculation: '2' } },
    {
      type: 'effect', targetByTags: true, targetTags: ['named'], targetField: 'quantityExpected',
      operation: 'add', amount: { calculation: '2' },
    },
  ],
};

const valueOf = async (propId: string, field: string) =>
  ((await CreatureProperties.findOneAsync(propId)) as Record<string, any> | undefined)?.[field]?.value;

describe('Tag targeted effects on a property\'s main calculation', function () {
  this.timeout(8000);

  before(async function () {
    await removeAllCreaturesAndProps();
    await createTestCreature(creature);
  });

  it('change an attack\'s roll, a save\'s DC, a spell list\'s attack bonus', async function () {
    assert.equal(await valueOf(attackId, 'attackRoll'), 5);
    assert.equal(await valueOf(saveId, 'dc'), 14);
    assert.equal(await valueOf(spellListId, 'attackRollBonus'), 7);
  });

  it('change a slot\'s expected quantity, as when the field is named', async function () {
    assert.equal(await valueOf(namedFieldSlotId, 'quantityExpected'), 3, 'the field named');
    assert.equal(await valueOf(slotId, 'quantityExpected'), 3, 'no field named');
  });
});
