import { assert } from 'chai';
import {
  allMutations, allUpdates, createTestCreature, getRandomIds, removeAllCreaturesAndProps, runActionById,
  type TestCreature,
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import { translateLogLine } from '/imports/api/creature/log/logMessages';
import { translatorFor } from '/imports/api/creature/log/discord/discordMessages';
import type { ForestProp } from '/imports/api/engine/computation/utility/propsFromForest.testFn';
import { get } from 'lodash';
import en from '/imports/ui/i18n/en.json';
import fr from '/imports/ui/i18n/fr.json';

/*
 * Legendary Resistance (phase 3.3 of the monsters, Q6): a creature with a
 * point of `legendaryResistance` left and `useLegendaryResistance` on
 * succeeds a saving throw it fails, spends the point, and the line says so.
 * The test dice roll 10 on a d20: a save of +0 against DC 15 fails, one of
 * +10 succeeds.
 */

const [
  casterId, saveId, twoSavesId, lichId, lichResistanceId, offId, offResistanceId, spentId, spentResistanceId,
  lastId, lastResistanceId, sureId, sureResistanceId, heroId, conditionalId, conditionalResistanceId,
] = getRandomIds(16);

const branches = (): ForestProp[] => [
  { type: 'branch', branchType: 'failedSave', children: [{ type: 'note', name: 'Failed branch' }] },
  { type: 'branch', branchType: 'successfulSave', children: [{ type: 'note', name: 'Saved branch' }] },
];
const save = (extra: object = {}) => ({
  type: 'savingThrow', name: 'Fireball', target: 'target', dc: { calculation: '15' }, stat: 'dexteritySave',
  children: branches(), ...extra,
});

const caster: TestCreature = {
  _id: casterId, name: 'Mage',
  props: [
    { _id: saveId, ...save() } as any,
    // Two saving throws in one action, on the same creature
    {
      _id: twoSavesId, type: 'action', name: 'Two saves', target: 'singleTarget',
      children: [save({ name: 'First' }), save({ name: 'Second' })],
    } as any,
  ],
};

// A monster of the bestiary's kind: its points, its toggle
const legendary = (_id: string, name: string, resourceId: string, {
  bonus = 0, points = 3, spent = 0, toggle = { enabled: true } as object,
} = {}): TestCreature => ({
  _id, name, type: 'monster',
  props: [
    { type: 'skill', skillType: 'save', name: 'Dexterity Save', variableName: 'dexteritySave', baseValue: { calculation: String(bonus) } },
    {
      _id: resourceId, type: 'attribute', attributeType: 'resource', name: 'Legendary Resistance',
      variableName: 'legendaryResistance', baseValue: { calculation: String(points) }, damage: spent,
    },
    { type: 'toggle', name: 'Legendary Resistance: use automatically', variableName: 'useLegendaryResistance', showUI: true, ...toggle },
  ] as ForestProp[],
});

const lich = legendary(lichId, 'Lich', lichResistanceId);
const off = legendary(offId, 'Dragon kept back', offResistanceId, { toggle: { disabled: true } });
const spent = legendary(spentId, 'Spent dragon', spentResistanceId, { points: 3, spent: 3 });
const last = legendary(lastId, 'Last point', lastResistanceId, { points: 1 });
const sure = legendary(sureId, 'Nimble dragon', sureResistanceId, { bonus: 10 });
// The toggle on by its condition, neither enabled nor disabled
const conditional = legendary(conditionalId, 'Conditional', conditionalResistanceId, {
  toggle: { condition: { calculation: '1 > 0' } },
});
const hero: TestCreature = {
  _id: heroId, name: 'Hero',
  props: [{ type: 'skill', skillType: 'save', name: 'Dexterity Save', variableName: 'dexteritySave', baseValue: { calculation: '0' } } as any],
};

const lines = (action: Awaited<ReturnType<typeof runActionById>>) => allMutations(action, { withMessages: true })
  .flatMap(mutation => mutation.contents || []);
const names = (action: Awaited<ReturnType<typeof runActionById>>) => lines(action).map(line => line.name);
const spentOn = (action: Awaited<ReturnType<typeof runActionById>>, propId: string) => allUpdates(action)
  .filter(update => update.propId === propId);

describe('Legendary resistance', function () {
  this.timeout(20000);

  before(async function () {
    await removeAllCreaturesAndProps();
    for (const creature of [caster, lich, off, spent, last, sure, conditional, hero]) await createTestCreature(creature);
  });

  after(removeAllCreaturesAndProps);

  it('turns a failed saving throw into a success, spends a point, and says so', async function () {
    const action = await runActionById(saveId, [lichId]);
    const outcome = lines(action).find(line => line.i18n?.name?.key === 'logs.legendaryResistance');
    assert.exists(outcome, JSON.stringify(names(action)));
    assert.equal(outcome!.name, 'Failed → success (legendary resistance)');
    assert.equal(outcome!.value, '1d20 [ 10 ] + 0\n**10**', 'the roll that failed, for its own readers');
    assert.equal(translateLogLine(outcome!, translatorFor('fr')).name, 'Échec → réussite (résistance légendaire)');
    // Its players, if it is hidden from them: whose, and the outcome, never the roll
    assert.deepEqual(outcome!.hiddenTargetView, {
      name: 'Lich · Failed → success (legendary resistance)',
      i18n: { name: { key: 'logs.forTarget', params: { target: 'Lich', name: { key: 'logs.legendaryResistance' } } } },
    });
    assert.include(names(action), 'Saved branch');
    assert.notInclude(names(action), 'Failed branch');
    assert.notInclude(names(action), 'Failed save');
    // One point, on the monster, in its own log
    assert.deepEqual(spentOn(action, lichResistanceId).map(update => update.inc), [{ damage: 1, value: -1 }]);
    const spendLine = allMutations(action, { withMessages: true })
      .find(mutation => mutation.updates?.some(update => update.propId === lichResistanceId));
    assert.deepEqual(spendLine?.targetIds, [lichId]);
    assert.equal(spendLine?.contents?.[0].value, '−1 Legendary Resistance');
    assert.notExists(spendLine?.contents?.[0].hiddenTargetView, 'never for those it is hidden from');
  });

  it('keeps its points while its toggle is off: the save fails', async function () {
    const action = await runActionById(saveId, [offId]);
    assert.include(names(action), 'Failed save');
    assert.include(names(action), 'Failed branch');
    assert.isEmpty(spentOn(action, offResistanceId));
  });

  it('uses it with the toggle on by its condition', async function () {
    const action = await runActionById(saveId, [conditionalId]);
    assert.include(names(action), 'Failed → success (legendary resistance)');
    assert.lengthOf(spentOn(action, conditionalResistanceId), 1);
  });

  it('fails as before once its points are spent', async function () {
    const action = await runActionById(saveId, [spentId]);
    assert.include(names(action), 'Failed save');
    assert.isEmpty(spentOn(action, spentResistanceId));
  });

  it('counts the points the action spent already: its last one turns the first failure alone', async function () {
    const action = await runActionById(twoSavesId, [lastId]);
    const outcomes = lines(action).filter(line => ['logs.legendaryResistance', 'logs.saveFailed', 'logs.saveSucceeded']
      .includes(line.i18n?.name?.key as string)).map(line => line.i18n?.name?.key);
    assert.deepEqual(outcomes, ['logs.legendaryResistance', 'logs.saveFailed']);
    assert.lengthOf(spentOn(action, lastResistanceId), 1, 'one point, never below zero');
  });

  it('spends nothing on a saving throw it makes', async function () {
    const action = await runActionById(saveId, [sureId]);
    assert.include(names(action), 'Successful save');
    assert.isEmpty(spentOn(action, sureResistanceId));
  });

  it('changes nothing for a creature without it', async function () {
    const action = await runActionById(saveId, [heroId]);
    assert.include(names(action), 'Failed save');
    assert.isEmpty(allUpdates(action));
  });

  it('says it in English and French', function () {
    assert.equal(get(en, 'logs.legendaryResistance'), 'Failed → success (legendary resistance)');
    assert.equal(get(fr, 'logs.legendaryResistance'), 'Échec → réussite (résistance légendaire)');
  });
});
