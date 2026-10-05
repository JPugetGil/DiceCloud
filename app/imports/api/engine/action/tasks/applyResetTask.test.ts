import { assert } from 'chai';
import {
  allLogContent,
  createTestCreature,
  getRandomIds,
  removeAllCreaturesAndProps,
  TestCreature
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
