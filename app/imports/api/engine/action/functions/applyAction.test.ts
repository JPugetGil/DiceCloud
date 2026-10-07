import { assert } from 'chai';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import EngineActions from '/imports/api/engine/action/EngineActions';
import applyAction from '/imports/api/engine/action/functions/applyAction';
import {
  allMutations,
  createTestCreature,
  getRandomIds,
  removeAllCreaturesAndProps,
  runActionById,
  TestCreature,
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import inputProvider from '/imports/api/engine/action/functions/userInput/inputProviderForTests.testFn';

const [
  creatureId, targetCreatureId, attackSpellId, saveSpellId, levelSpellId,
] = getRandomIds(5);

// A spell list's DC and attack bonus, which its spells read as their
// ancestor's: `#spellList.dc`, `#spellList.attackRollBonus`
const casterCreature: TestCreature = {
  _id: creatureId,
  props: [{
    type: 'spellList',
    name: 'Wizard Spells',
    dc: { calculation: '13' },
    attackRollBonus: { calculation: '5' },
    children: [{
      _id: attackSpellId,
      type: 'spell',
      name: 'Fire Bolt',
      level: 0,
      attackRoll: { calculation: '#spellList.attackRollBonus' },
    }, {
      _id: saveSpellId,
      type: 'spell',
      name: 'Fireball',
      level: 3,
      children: [{
        type: 'savingThrow',
        name: 'Fireball',
        dc: { calculation: '#spellList.dc' },
        stat: 'dexteritySave',
      }],
    }, {
      _id: levelSpellId,
      type: 'spell',
      name: 'Hold Person',
      level: 2,
      children: [{
        type: 'savingThrow',
        name: 'Hold Person',
        dc: { calculation: '#spell.level + 10' },
        stat: 'dexteritySave',
      }],
    }],
  }],
};

const targetCreature: TestCreature = {
  _id: targetCreatureId,
  props: [{
    type: 'skill',
    variableName: 'dexteritySave',
    baseValue: { calculation: '2' },
  }],
};

// Every log line's value, in order
function logValues(action) {
  return allMutations(action).flatMap(mutation => mutation.contents ?? [])
    .map(content => content.value);
}

// Casts the spell with the spell slot dialog's task (castSpell), without a slot
async function castSpell(spellId: string, targetIds: string[]) {
  const prop = await CreatureProperties.findOneAsync(spellId);
  const actionId = await EngineActions.insertAsync({
    creatureId,
    results: [],
    taskCount: 0,
    task: {
      subtaskFn: 'castSpell',
      prop,
      targetIds,
      params: { slotId: undefined, ritual: undefined, withoutSpellSlot: true },
    },
  } as any);
  const action = await EngineActions.findOneAsync(actionId);
  if (!action) throw 'Action is expected to exist';
  await applyAction(action, inputProvider, { simulate: true });
  return action;
}

describe('Apply action: the ancestors of the property it starts from', function () {
  this.timeout(8000);

  before(async function () {
    await removeAllCreaturesAndProps();
    await createTestCreature(casterCreature);
    await createTestCreature(targetCreature);
  });

  it('gives a spell its spell list\'s attack bonus', async function () {
    const action = await runActionById(attackSpellId, []);
    assert.include(logValues(action), '1d20 [10] + 5\n**15**');
  });

  it('gives a spell\'s saving throw its spell list\'s DC', async function () {
    const action = await runActionById(saveSpellId, [targetCreatureId]);
    assert.include(logValues(action), 'DC **13**');
  });

  it('gives a spell cast from the slot dialog its spell list\'s DC', async function () {
    const action = await castSpell(saveSpellId, [targetCreatureId]);
    assert.include(logValues(action), 'DC **13**');
  });

  it('gives a spell cast from the slot dialog its own fields as #spell', async function () {
    const action = await castSpell(levelSpellId, [targetCreatureId]);
    assert.include(logValues(action), 'DC **12**');
  });
});
