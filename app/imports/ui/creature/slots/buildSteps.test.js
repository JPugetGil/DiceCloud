import { assert } from 'chai';
import buildSteps from '/imports/ui/creature/slots/buildSteps';

const slot = (_id, left, right, fields = {}) => ({
  _id, name: _id, left, right, quantityExpected: { value: 1 }, spaceLeft: 1, ...fields,
});
const filled = { spaceLeft: 0 };
const locked = { slotCondition: { value: false } };

// A ruleset chosen, with a library's steps under it
const ruleset = slot('Ruleset', 1, 100, { slotTags: ['base'], ...filled });

describe('Build steps', function () {
  it('names the steps under the ruleset, in the library\'s order', function () {
    const result = buildSteps([
      slot('Class', 30, 31),
      ruleset,
      slot('Race', 10, 11, filled),
      slot('Background', 20, 21),
    ]);
    assert.deepEqual(result.steps.map(step => step.name), ['Race', 'Background', 'Class']);
    assert.deepEqual(result.steps.map(step => step.done), [true, false, false]);
    assert.include(result, { total: 3, done: 1, left: 2 });
    assert.equal(result.next?.name, 'Background');
  });

  it('counts the choices a step opens in the step, so the count never goes back', function () {
    const before = buildSteps([ruleset, slot('Race', 10, 19), slot('Class', 30, 31)]);
    // Choosing a race opens a subrace slot inside it
    const after = buildSteps([
      ruleset, slot('Race', 10, 19, filled), slot('Subrace', 12, 13), slot('Class', 30, 31),
    ]);
    assert.include(before, { total: 2, done: 0 });
    assert.include(after, { total: 2, done: 0 });
    assert.equal(after.steps[0].waitingId, 'Subrace');
    const chosen = buildSteps([
      ruleset, slot('Race', 10, 19, filled), slot('Subrace', 12, 13, filled), slot('Class', 30, 31),
    ]);
    assert.include(chosen, { total: 2, done: 1, left: 1 });
  });

  it('counts a step whose condition is not met yet as locked', function () {
    const result = buildSteps([ruleset, slot('Intro', 5, 6), slot('Race', 10, 11, locked)]);
    assert.include(result, { total: 2, done: 0, left: 1 });
    assert.isTrue(result.steps[1].locked);
    assert.isUndefined(result.steps[1].waitingId);
    assert.equal(result.next?.name, 'Intro');
  });

  it('counts a locked step filled earlier as done', function () {
    const result = buildSteps([ruleset, slot('Race', 10, 11, { ...locked, ...filled })]);
    assert.include(result, { total: 1, done: 1, left: 0 });
  });

  it('makes the ruleset the first step until it is chosen', function () {
    const result = buildSteps([slot('Ruleset', 1, 2, { slotTags: ['base'] })]);
    assert.deepEqual(result.steps.map(step => step.name), ['Ruleset']);
    assert.include(result, { total: 1, done: 0, left: 1 });
  });

  it('keeps a step made inactive once done, as done', function () {
    // A tutorial's stage, turned off once past it
    const result = buildSteps([ruleset, slot('Intro', 5, 6, { inactive: true, ...filled }), slot('Race', 10, 11)]);
    assert.include(result, { total: 2, done: 1, left: 1 });
  });

  it('leaves out hidden, inactive and open-ended slots', function () {
    const result = buildSteps([
      ruleset,
      slot('Hidden', 10, 11, { ignored: true }),
      slot('Inactive', 12, 13, { inactive: true }),
      slot('Sources', 14, 15, { quantityExpected: { value: 0 } }),
      slot('Removed', 16, 17, { removed: true }),
    ]);
    assert.include(result, { total: 0, done: 0, left: 0 });
    assert.isUndefined(result.next);
  });
});
