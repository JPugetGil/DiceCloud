import { assert } from 'chai';
import type {
  TestCreature
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import {
  allLogContent,
  createTestCreature,
  getRandomIds,
  removeAllCreaturesAndProps
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import EngineActions from '/imports/api/engine/action/EngineActions';
import applyAction from '/imports/api/engine/action/functions/applyAction';
import inputProvider from '/imports/api/engine/action/functions/userInput/inputProviderForTests.testFn';

const [creatureId, restedCreatureId, multiclassCreatureId] = getRandomIds(3);

const creature: TestCreature = {
  _id: creatureId,
  props: [
    {
      type: 'attribute', name: 'Hit Points', attributeType: 'healthBar', variableName: 'hitPoints',
      baseValue: { calculation: '30' }, damage: 12, reset: 'longRest',
    },
    {
      type: 'attribute', name: 'Ki', attributeType: 'resource', variableName: 'ki',
      baseValue: { calculation: '3' }, damage: 3, reset: 'shortRest',
    },
    {
      type: 'attribute', name: 'Hit Dice', attributeType: 'hitDice', variableName: 'hitDice',
      hitDiceSize: 'd10', baseValue: { calculation: '4' }, damage: 3,
    },
    {
      type: 'attribute', name: 'Tutorial step', attributeType: 'utility', variableName: 'tutorialStep',
      baseValue: { calculation: '5' }, damage: 1, reset: 'longRest',
    },
    {
      type: 'action', name: 'Second Wind', uses: { calculation: '1' }, usesUsed: 1, reset: 'shortRest',
    },
  ],
};

const restedCreature: TestCreature = {
  _id: restedCreatureId,
  props: [{
    type: 'attribute', name: 'Hit Points', attributeType: 'healthBar', variableName: 'hitPoints',
    baseValue: { calculation: '30' }, reset: 'longRest',
  }],
};

// Its larger hit dice are all there, the smaller all spent
const multiclassCreature: TestCreature = {
  _id: multiclassCreatureId,
  props: [
    {
      type: 'attribute', name: 'Fighter Hit Dice', attributeType: 'hitDice', variableName: 'fighterHitDice',
      hitDiceSize: 'd10', baseValue: { calculation: '4' },
    },
    {
      type: 'attribute', name: 'Wizard Hit Dice', attributeType: 'hitDice', variableName: 'wizardHitDice',
      hitDiceSize: 'd6', baseValue: { calculation: '4' }, damage: 4,
    },
  ],
};

async function rest(targetId: string, eventName: string, withMessages = false) {
  const actionId = await EngineActions.insertAsync({
    creatureId: targetId,
    results: [],
    taskCount: 0,
    task: { subtaskFn: 'reset', targetIds: [targetId], eventName },
  } as any);
  const action = await EngineActions.findOneAsync(actionId);
  if (!action) throw 'Action is expected to exist';
  await applyAction(action, inputProvider, { simulate: true });
  return allLogContent(action, { withMessages });
}

describe('Rest summary', function () {
  this.timeout(8000);

  before(async function () {
    await removeAllCreaturesAndProps();
    await createTestCreature(creature);
    await createTestCreature(restedCreature);
    await createTestCreature(multiclassCreature);
  });

  it('lists what a long rest restored under its title, and silences each change', async function () {
    const [title, ...changes] = await rest(creatureId, 'longRest');
    assert.equal(title.name, 'Long rest');
    assert.equal(title.value, [
      '- Hit Points **+12** (30/30)',
      '- Ki **+3** (3/3)',
      '- Second Wind **+1** use',
      '- Hit Dice d10 **+2** (3/4)',
    ].join('\n'));
    assert.isNotEmpty(changes);
    assert.isTrue(changes.every(content => content.silenced), 'each change is silenced');
  });

  it('says when a rest had nothing to restore', async function () {
    const contents = await rest(restedCreatureId, 'shortRest');
    assert.deepEqual(contents, [{ name: 'Short rest', value: 'Nothing to restore' }]);
  });

  it('keeps the messages that translate the summary (UX5)', async function () {
    const [nothing] = await rest(restedCreatureId, 'shortRest', true);
    assert.deepEqual(nothing.i18n, { name: { key: 'logs.shortRest' }, value: [{ key: 'logs.nothingRestored' }] });
    const [title] = await rest(creatureId, 'longRest', true);
    assert.equal(title.i18n?.name?.key, 'logs.longRest');
    // An attribute's line stays as written (its name is the library's), a use is a message
    const parts: any[] = title.i18n?.value || [];
    assert.include(parts, '- Hit Points **+12** (30/30)');
    assert.deepInclude(parts, {
      key: 'logs.listItem', params: { item: { key: 'logs.restoredUse', params: { name: 'Second Wind', change: '+1' } } },
    });
  });

  it('restores smaller hit dice when the larger ones are all there', async function () {
    const [title] = await rest(multiclassCreatureId, 'longRest');
    assert.equal(title.value, '- Wizard Hit Dice d6 **+4** (4/4)');
  });
});

/*
 * The triggers of a rest (phase 3.1): they never fired, so the 31 rest
 * triggers of the Vexus libraries did nothing (Portent Roll Reset, Trance,
 * Exhaustion Long Rest, Wild Shape Removal...). Modelled on them: a long rest
 * fires the long rest's and "short or long rest"'s, a short rest the short
 * rest's and "short or long rest"'s; those timed before fire before the rest
 * restores anything, the others after it
 */
describe('Rest triggers', function () {
  this.timeout(8000);
  const [wizardId, portentId, fontId, anyRestId, beforeId, afterId] = getRandomIds(6);

  const wizard: TestCreature = {
    _id: wizardId,
    props: [
      {
        type: 'attribute', name: 'Foretelling Roll 1', attributeType: 'utility', variableName: 'foretellingRoll1',
        baseValue: { calculation: '20' },
      },
      {
        type: 'attribute', name: 'Foretelling Roll 2', attributeType: 'utility', variableName: 'foretellingRoll2',
        baseValue: { calculation: '20' },
      },
      {
        type: 'attribute', name: 'Ki', attributeType: 'resource', variableName: 'ki',
        baseValue: { calculation: '3' }, damage: 3, reset: 'shortRest',
      },
      // As the Myriad Academy for Wizards has it
      {
        _id: portentId, type: 'trigger', name: 'Portent Roll Reset', event: 'longRest', timing: 'after',
        children: [
          {
            type: 'adjustment', silent: true, operation: 'set', stat: 'foretellingRoll1', target: 'self',
            amount: { calculation: '1d20' },
          },
          { type: 'note', name: 'Portent 1' },
          {
            type: 'adjustment', silent: true, operation: 'set', stat: 'foretellingRoll2', target: 'self',
            amount: { calculation: '1d20' },
          },
          { type: 'note', name: 'Portent 2' },
        ],
      },
      { _id: fontId, type: 'trigger', name: 'Font of Inspiration', event: 'shortRest', timing: 'after' },
      { _id: anyRestId, type: 'trigger', name: 'RestTrigger', event: 'anyRest', timing: 'after' },
      // Ki is spent: before the rest, it is; after the rest, it is not
      {
        _id: beforeId, type: 'trigger', name: 'Ki spent before the rest', event: 'shortRest', timing: 'before',
        condition: { calculation: 'ki < 3' },
      },
      {
        _id: afterId, type: 'trigger', name: 'Ki spent after the rest', event: 'shortRest', timing: 'after',
        condition: { calculation: 'ki < 3' },
      },
      // Not a trigger of the creature as a whole: never fired by a rest
      { type: 'trigger', name: 'On a check', event: 'check', timing: 'after' },
    ],
  };

  async function restWizard(eventName: string) {
    const actionId = await EngineActions.insertAsync({
      creatureId: wizardId, results: [], taskCount: 0,
      task: { subtaskFn: 'reset', targetIds: [wizardId], eventName },
    } as any);
    const action = await EngineActions.findOneAsync(actionId);
    if (!action) throw 'Action is expected to exist';
    await applyAction(action, inputProvider, { simulate: true });
    return action;
  }
  const names = (action) => allLogContent(action).map(line => line.name);
  const setUpdates = action => action.results.flatMap(result => result.mutations)
    .flatMap(mutation => mutation.updates || []).filter(update => update.set);

  before(async function () {
    await removeAllCreaturesAndProps();
    await createTestCreature(wizard);
  });

  it('fires the long rest\'s triggers, and those of any rest, after it: "Portent Roll Reset" rolls the portents', async function () {
    const action = await restWizard('longRest');
    const lines = names(action);
    assert.equal(lines[0], 'Long rest', 'the rest\'s title first');
    assert.includeMembers(lines, ['Portent Roll Reset', 'Portent 1', 'Portent 2', 'RestTrigger']);
    assert.notInclude(lines, 'Font of Inspiration', 'a short rest\'s trigger');
    assert.notInclude(lines, 'On a check');
    // The test dice roll a d20 as 10: both portents are set to it
    const portents = setUpdates(action).map(update => update.set.value);
    assert.deepEqual(portents, [10, 10]);
    // After the rest: its summary comes before the triggers
    assert.isAbove(lines.indexOf('Portent Roll Reset'), lines.indexOf('Long rest'));
  });

  it('fires the short rest\'s and any rest\'s triggers, those timed before ahead of the rest, the others after it', async function () {
    const lines = names(await restWizard('shortRest'));
    assert.includeMembers(lines, ['Font of Inspiration', 'RestTrigger', 'Ki spent before the rest']);
    assert.notInclude(lines, 'Ki spent after the rest', 'ki is restored once the rest is over');
    assert.notInclude(lines, 'Portent Roll Reset', 'a long rest\'s trigger');
    assert.isBelow(lines.indexOf('Ki spent before the rest'), lines.indexOf('Font of Inspiration'));
  });

  it('fires no trigger on an event that is no rest (an event action\'s reset), nor on an object\'s own key', async function () {
    assert.deepEqual(names(await restWizard('dawnTrigger')), []);
    assert.deepEqual(names(await restWizard('constructor')), []);
  });
});
