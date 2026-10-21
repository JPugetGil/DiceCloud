import { assert } from 'chai';
import computeVariableAsSkill from './computeVariableAsSkill';

/*
 * A skill's value and its passive score, from its base, its ability, its
 * proficiency and its effects. Found by comparing copies (2026-10-21): the
 * disadvantage's -5 went to a misspelled field, neither +5 nor -5 applied
 * without a passive effect, a negative base turned 0 under any effect, and a
 * skill nothing defines never hid.
 */
const aggregator = (fields = {}) => ({
  base: undefined, add: 0, mul: 1, min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY,
  advantage: 0, disadvantage: 0, passiveAdd: undefined, fail: 0, set: undefined, conditional: [], rollBonus: [],
  ...fields,
});

/**
 * A saving throw (it inherits nothing of its ability), +1 Dexterity, proficiency bonus 2
 * @param {{ baseValue?: number, proficiency?: number, effects?: Record<string, number> }} [options]
 * @returns {any}
 */
function skill({ baseValue, proficiency = 0, effects } = {}) {
  const computation = { scope: { dexterity: { modifier: 1 }, proficiencyBonus: { value: 2 } } };
  const node = { data: { baseValue, proficiency, ...effects && { effectAggregator: aggregator(effects) } } };
  const prop = { ability: 'dexterity', skillType: 'save' };
  computeVariableAsSkill(computation, node, prop);
  return prop;
}

describe('Skills: value and passive score', function () {
  it('takes 5 off the passive score with disadvantage, and adds 5 with advantage', function () {
    assert.equal(skill({ effects: { disadvantage: 1 } }).passiveBonus, -5);
    assert.equal(skill({ effects: { advantage: 1 } }).passiveBonus, 5);
    assert.equal(skill({ effects: { disadvantage: 1, passiveAdd: 2 } }).passiveBonus, -3);
    assert.equal(skill({ effects: { advantage: 1, disadvantage: 1, passiveAdd: 2 } }).passiveBonus, 2, 'both cancel out');
    assert.isUndefined(skill({ effects: { add: 1 } }).passiveBonus, 'no passive effect, no advantage: none');
  });

  it('keeps a negative base under an effect that sets no base', function () {
    assert.equal(skill({ baseValue: -2 }).value, -1, 'base -2, Dexterity +1');
    assert.equal(skill({ baseValue: -2, effects: { advantage: 1 } }).value, -1, 'the same with advantage');
    assert.equal(skill({ baseValue: -2, effects: { base: 3 } }).value, 4, 'the greater base');
    assert.equal(skill({ effects: { base: -4 } }).value, -3, 'an effect\'s base alone');
  });

  it('hides a skill that nothing defines and nothing makes proficient', function () {
    assert.isTrue(skill({}).hide);
    assert.isUndefined(skill({ baseValue: 0 }).hide, 'one with a base');
    assert.isUndefined(skill({ proficiency: 1 }).hide, 'one it is proficient in');
  });
});
