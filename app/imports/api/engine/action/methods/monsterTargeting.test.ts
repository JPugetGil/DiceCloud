import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { get } from 'lodash';
import CreatureFoldersCollection from '/imports/api/creature/creatureFolders/CreatureFolders';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import EngineActions, { type EngineAction } from '/imports/api/engine/action/EngineActions';
import {
  allMutations, createTestCreature, getRandomIds, removeAllCreaturesAndProps, runActionById, type TestCreature,
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import { clientInputProvider } from '/imports/api/engine/action/functions/userInput/inputProviderForTests.testFn';
import type InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import applyAction from '/imports/api/engine/action/functions/applyAction';
import { insertAction } from '/imports/api/engine/action/methods/insertAction';
import { runAction } from '/imports/api/engine/action/methods/runAction';
import writeActionResults from '/imports/api/engine/action/functions/writeActionResults';
import TaskResult from '/imports/api/engine/action/tasks/TaskResult';
import { Random } from 'meteor/random';
import { drawDice } from '/imports/api/engine/action/methods/drawDice';
import { openAs, refusal } from '/imports/api/utility/ddpClient.testFn';
import { partyLetsTarget, partyTargetable } from '/imports/api/creature/creatureFolders/party';
import { seenBy, WHOLE } from '/imports/api/creature/log/logViews';
import { translateLogLine } from '/imports/api/creature/log/logMessages';
import { translatorFor } from '/imports/api/creature/log/discord/discordMessages';
import {
  createWebhookSender, discordIntakeIdle, forgetWebhook, setWebhookSender, type WebhookSender,
} from '/imports/api/creature/log/server/discordWebhooks';
import { setPartyWebhook } from '/imports/api/creature/creatureFolders/methods/discordMethods';
import { fakeDiscord, type FakeDiscord } from '/imports/api/creature/log/server/fakeDiscord.testFn';
import en from '/imports/ui/i18n/en.json';
import fr from '/imports/ui/i18n/fr.json';

// Untyped: the folders' schema is JavaScript
const CreatureFolders = CreatureFoldersCollection as any;

// The server's dice: node:crypto, which the client's bundle of the tests has not
let actionDice: typeof import('/imports/api/engine/action/functions/userInput/server/actionDice');
if (Meteor.isServer) {
  // Unit tests load no entry point: the publications and the methods register here
  /* eslint-disable @typescript-eslint/no-require-imports */
  require('/imports/api/creature/creatureFolders/server/publications/partyBoard');
  require('/imports/api/creature/creatureFolders/server/publications/characterParties');
  require('/imports/api/creature/creatures/server/publications/singleCharacter');
  require('/imports/startup/server/publicationStrategies');
  require('/imports/api/engine/action/methods/index');
  require('/imports/api/creature/creatureFolders/methods/index');
  actionDice = require('/imports/api/engine/action/functions/userInput/server/actionDice');
  /* eslint-enable @typescript-eslint/no-require-imports */
}

/*
 * Phase 2.3 of the monsters: a player's character targets the game master's
 * monsters. Its player learns the results alone — hit or miss, the saving
 * throw made or failed, the damage dealt, its resistances — never the
 * monster's armor class, saving throws, hit points, stats or effects. The
 * monster's own log, its game master's, has everything.
 *
 * Goblin 2 carries distinctive values, which no player may ever read: armor
 * class 271828, hit points 314159 (314152 once hit for 7), Dexterity save
 * −161803 (totals −161802 to −161783), Strength 141421, a hidden effect
 * SECRET-SEAL, a damage trigger SECRET-TRIGGER, and it concentrates. Each
 * contains a 0 or a 1, which ids never do (Random.id), and the DDP frames are
 * searched without their dates.
 */

const [gmId, playerId, otherPlayerId, outsiderId] = getRandomIds(4);
const [folderId] = getRandomIds(1);
const [lyraId, ariaId, goblinId, impId, innkeeperId, strayMonsterId] = getRandomIds(6);
const [
  swordId, flameId, charmId, hexId, dispelId, enfeebleId, curseId, burnId, trickId, ambushId, breathId, goblinHpId,
  ariaHpId, sparkId, empowerId, petrifyId,
] = getRandomIds(16);

// What the goblin's sheet holds: its armor class, hit points (whole and once
// hit), saving throw and its totals, Strength; its hidden effect, its damage
// trigger's line; lines that tell its sheet: no armor class, no saving throw,
// no such stat, concentrating
const VALUES = [
  '27182', '31415', '16180', '1617', '1618', '14142', '14141', 'SECRET',
  'logs.noArmor', 'logs.noSave', 'No saving throw found', 'does not have', 'logs.concentrationCheck',
];
// And its attributes changed: where the player acts on no other creature
const CANARIES = [...VALUES, 'logs.attributeDamaged', 'logs.attributeRestored', 'logs.attributeSet'];

const hitPoints = (_id: string | undefined, total: number) => ({
  ...(_id && { _id }), type: 'attribute', name: 'Hit Points', attributeType: 'healthBar', variableName: 'hitPoints',
  baseValue: { calculation: String(total) },
}) as any;
const dexteritySave = (bonus: number) => ({
  type: 'skill', skillType: 'save', name: 'Dexterity Save', variableName: 'dexteritySave',
  baseValue: { calculation: String(bonus) },
}) as any;

// The player's character: an attack, saving throws, a buff that reads its
// target, a dispel, adjustments; formulas that print what the action's scope
// holds
const lyra: TestCreature = {
  _id: lyraId, name: 'Lyra', owner: playerId, type: 'pc', writers: [gmId],
  props: [
    hitPoints(undefined, 50),
    dexteritySave(2),
    {
      _id: swordId, type: 'action', name: 'Sword', target: 'singleTarget', attackRoll: { calculation: '300000' },
      summary: { text: 'A fine blade' },
      children: [{
        type: 'branch', branchType: 'hit',
        children: [
          { type: 'damage', target: 'target', damageType: 'slashing', amount: { calculation: '7' } },
          { type: 'note', name: 'Struck', summary: { text: 'Left {~attributeDamaged.value} of {~attributeDamaged.total}' } },
        ],
      }, {
        type: 'branch', branchType: 'miss', children: [{ type: 'note', name: 'Missed' }],
      }],
    } as any,
    {
      _id: flameId, type: 'action', name: 'Sacred Flame', target: 'singleTarget',
      children: [{
        type: 'savingThrow', name: 'Sacred Flame', target: 'target', dc: { calculation: '15' }, stat: 'dexteritySave',
        children: [
          {
            type: 'branch', branchType: 'failedSave',
            children: [{ type: 'damage', target: 'target', damageType: 'radiant', amount: { calculation: '5' } }],
          },
          { type: 'branch', branchType: 'successfulSave', children: [{ type: 'note', name: 'Dodged' }] },
          { type: 'note', name: 'Flame roll', summary: { text: 'Rolled {~saveRoll} with {~saveDiceRoll}' } },
        ],
      }],
    } as any,
    {
      _id: charmId, type: 'action', name: 'Charm', target: 'singleTarget',
      children: [{
        type: 'savingThrow', name: 'Charm', target: 'target', dc: { calculation: '13' }, stat: 'charismaSave',
      }],
    } as any,
    {
      _id: hexId, type: 'buff', name: 'Hex', target: 'target',
      description: { text: 'Hexed {~target.name}: {~target.hitPoints.value} {~target.armor.value} {~target.strength.value}' },
      children: [{ type: 'note', name: 'Hex note' }],
    } as any,
    {
      _id: dispelId, type: 'action', name: 'Dispel', target: 'singleTarget',
      children: [{ type: 'buffRemover', name: 'Dispel Magic', target: 'target', removeAll: true, targetTags: ['magic'] }],
    } as any,
    {
      _id: enfeebleId, type: 'action', name: 'Enfeeble', target: 'singleTarget',
      children: [{
        type: 'adjustment', target: 'target', stat: 'strength', operation: 'increment', amount: { calculation: '2' },
      }],
    } as any,
    // Its Strength up, then set: the player's own numbers, never the goblin's
    {
      _id: empowerId, type: 'action', name: 'Empower', target: 'singleTarget',
      children: [{
        type: 'adjustment', target: 'target', stat: 'strength', operation: 'increment', amount: { calculation: '-3' },
      }],
    } as any,
    {
      _id: petrifyId, type: 'action', name: 'Petrify', target: 'singleTarget',
      children: [{
        type: 'adjustment', target: 'target', stat: 'strength', operation: 'set', amount: { calculation: '10' },
      }],
    } as any,
    {
      _id: curseId, type: 'action', name: 'Curse', target: 'singleTarget',
      children: [{
        type: 'adjustment', target: 'target', stat: 'wisdomX', operation: 'increment', amount: { calculation: '1' },
      }],
    } as any,
    // Damage on its target, no attack nor saving throw: the goblin resists it
    { _id: sparkId, type: 'damage', target: 'target', damageType: 'radiant', amount: { calculation: '4' } } as any,
    // A die of the actor's after the monster's saving throw: its position
    // must not move with the monster's dice
    {
      _id: burnId, type: 'action', name: 'Burning Hands', target: 'singleTarget',
      children: [{
        type: 'savingThrow', name: 'Burning Hands', target: 'target', dc: { calculation: '15' }, stat: 'dexteritySave',
        children: [{
          type: 'branch', branchType: 'failedSave',
          children: [{ type: 'damage', target: 'target', damageType: 'fire', amount: { calculation: '1d100' } }],
        }],
      }],
    } as any,
    // A homebrew attack: dice on a hit, which the browser does not know of,
    // then a choice
    {
      _id: trickId, type: 'action', name: 'Trick shot', target: 'singleTarget', attackRoll: { calculation: '300000' },
      children: [{
        type: 'branch', branchType: 'hit',
        children: [{ type: 'damage', target: 'target', damageType: 'slashing', amount: { calculation: '1d6' } }],
      }, {
        type: 'branch', branchType: 'choice',
        children: [{ type: 'note', name: 'Went left' }, { type: 'note', name: 'Went right' }],
      }],
    } as any,
    // A choice on a hit alone, which the browser never reaches
    {
      _id: ambushId, type: 'action', name: 'Ambush', target: 'singleTarget', attackRoll: { calculation: '300000' },
      children: [{
        type: 'branch', branchType: 'hit',
        children: [{
          type: 'branch', branchType: 'choice',
          children: [{ type: 'note', name: 'Stab' }, { type: 'note', name: 'Slash' }],
        }],
      }],
    } as any,
    // On a monster and another player's character at once
    {
      _id: breathId, type: 'action', name: 'Thunder Breath', target: 'multipleTargets',
      children: [{
        type: 'savingThrow', name: 'Thunder Breath', target: 'target', dc: { calculation: '15' }, stat: 'dexteritySave',
        children: [{
          type: 'branch', branchType: 'failedSave',
          children: [{ type: 'damage', target: 'target', damageType: 'thunder', amount: { calculation: '3' } }],
        }],
      }],
    } as any,
  ],
};

// Another player's character, at the same table
const aria: TestCreature = {
  _id: ariaId, name: 'Aria', owner: otherPlayerId, type: 'pc', writers: [gmId],
  props: [
    hitPoints(ariaHpId, 20000), dexteritySave(-50),
    { type: 'attribute', attributeType: 'stat', name: 'Armor Class', variableName: 'armor', baseValue: { calculation: '5' } } as any,
  ],
};

const goblin: TestCreature = {
  _id: goblinId, name: 'Goblin 2', owner: gmId, type: 'monster',
  props: [
    hitPoints(goblinHpId, 314159),
    { type: 'attribute', attributeType: 'stat', name: 'Armor Class', variableName: 'armor', baseValue: { calculation: '271828' } } as any,
    dexteritySave(-161803),
    { type: 'attribute', attributeType: 'ability', name: 'Strength', variableName: 'strength', baseValue: { calculation: '141421' } } as any,
    { type: 'toggle', name: 'Concentration', variableName: 'concentration', enabled: true } as any,
    { type: 'damageMultiplier', name: 'Radiant resistance', damageTypes: ['radiant'], value: 0.5 } as any,
    { type: 'buff', name: 'SECRET-SEAL', tags: ['magic'], children: [{ type: 'note', name: 'SECRET-SEAL note' }] } as any,
    { type: 'buff', name: 'Poisoned', tags: ['condition', 'magic'] } as any,
    {
      type: 'trigger', name: 'SECRET-TRIGGER', event: 'damageProperty', timing: 'after', targetTags: ['hitPoints'],
      description: { text: 'SECRET-TRIGGER: hurt by {~damage}' },
    } as any,
  ],
};

// A monster with no armor class nor saving throws: what its sheet lacks stays its game master's
const imp: TestCreature = {
  _id: impId, name: 'Imp', owner: gmId, type: 'monster', props: [hitPoints(undefined, 9)],
};
// The game master's non-player character
const innkeeper: TestCreature = {
  _id: innkeeperId, name: 'Innkeeper', owner: gmId, type: 'npc', props: [hitPoints(undefined, 10)],
};
// A monster of someone outside the table, which the game master put in the folder
const strayMonster: TestCreature = {
  _id: strayMonsterId, name: 'Stray wolf', owner: outsiderId, type: 'monster', props: [hitPoints(undefined, 10)],
};
const ALL = [lyra, aria, goblin, imp, innkeeper, strayMonster];

const DENIED = 'targetPicker.errors.denied';
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const text = (value: unknown) => JSON.stringify(value ?? null);
// The frames' dates are numbers of their own
const withoutDates = (value: unknown) => text(value).replace(/\{"\$date":\d+\}/g, '{}');
const latestLog = (creatureId: string) => CreatureLogs.findOneAsync({ creatureId }, { sort: { date: -1 } }) as Promise<any>;
const logOf = (actionId: string, creatureId: string) => CreatureLogs.findOneAsync({ actionId, creatureId }) as Promise<any>;
const lineNamed = (log: any, name: string) => log?.content?.find((line: any) => line.name === name);
const damageOf = async (propId: string) => ((await CreatureProperties.findOneAsync(propId)) as any)?.damage || 0;

type Connection = Awaited<ReturnType<typeof openAs>>;

/** A method's result over DDP, waiting out its rate limit as a browser would */
async function call(connection: Connection, name: string, args: object): Promise<any> {
  for (;;) {
    try {
      return await connection.call(name, args);
    } catch (e: any) {
      if (e?.error !== 'too-many-requests') throw e;
      await pause((e.details?.timeToReset ?? 500) + 50);
    }
  }
}

const propTask = (propId: string, targetIds: string[]) => ({ prop: { _id: propId }, targetIds });
const insert = (connection: Connection, creatureId: string, task: object) => call(connection, 'actions.insertAction', {
  action: { creatureId, task, results: [], taskCount: 0 },
});

/**
 * Gives an action a seed of the test's whose first d20 is neither a 1 nor a
 * 20: an attack then hits or misses as its total says, every run
 */
async function steadySeed(actionId: string) {
  for (let i = 0; ; i += 1) {
    const seed = `steady-seed-${i}`;
    const d20 = actionDice.seededDie(seed, 0, 20);
    if (d20 > 1 && d20 < 20) {
      await EngineActions.updateAsync(actionId, { $set: { seed } });
      return;
    }
  }
}

// A method run as a user, as the server runs it (mdg:validated-method's _execute)
const execute = (method: unknown, userId: string, args: unknown): Promise<any> =>
  (method as { _execute(invocation: { userId: string }, args: unknown): Promise<any> })._execute({ userId }, args);

async function setUp() {
  await removeAllCreaturesAndProps();
  await Meteor.users.rawCollection().insertMany([gmId, playerId, otherPlayerId, outsiderId].map((_id, i) => ({
    _id, createdAt: new Date(), username: `monster-targeting-${i}-${_id}`,
  })) as any[]);
  for (const creature of ALL) await createTestCreature(creature);
  await CreatureFolders.rawCollection().insertOne({
    _id: folderId, name: 'The table', owner: gmId, members: [playerId, otherPlayerId],
    creatures: [lyraId, ariaId, goblinId, impId, innkeeperId, strayMonsterId], order: 0,
  });
}

async function tearDown() {
  const ids = ALL.map(creature => creature._id);
  await CreatureLogs.removeAsync({ creatureId: { $in: ids } });
  await EngineActions.removeAsync({ creatureId: { $in: ids } });
  await CreatureFolders.removeAsync(folderId);
  await Meteor.users.removeAsync({ _id: { $in: [gmId, playerId, otherPlayerId, outsiderId] } });
  await removeAllCreaturesAndProps();
}

/*
 * The canary test: what the player's browser receives while their character
 * attacks the goblin, casts saving throws at it, hexes it, dispels its
 * effects and adjusts its stats, through every publication their sheet and
 * the board open, the methods' results and the dice they draw. Not one of
 * the goblin's values may arrive. The game master receives them all.
 */
if (Meteor.isServer) describe('A player\'s character targets the game master\'s monster: what the player receives', function () {
  this.timeout(120000);
  before(setUp);
  after(tearDown);

  let player: Connection;
  let gm: Connection;
  const actionIds: Record<string, string> = {};

  before(async function () {
    player = await openAs(playerId);
    gm = await openAs(gmId);
    await player.subscribe('singleCharacter', lyraId);
    await player.subscribe('partyBoard', folderId);
    await player.subscribe('characterParties', lyraId);
    await gm.subscribe('singleCharacter', goblinId);
    await gm.subscribe('singleCharacter', impId);
    await gm.subscribe('partyBoard', folderId);
    // As the sheet plays them: insertAction, the dice drawn one roll at a
    // time (here many more than the actions roll), then runAction
    const plays: [string, string, string][] = [
      ['sword', swordId, goblinId], ['flame', flameId, goblinId], ['charm', charmId, goblinId],
      ['hex', hexId, goblinId], ['dispel', dispelId, goblinId], ['enfeeble', enfeebleId, goblinId],
      ['empower', empowerId, goblinId], ['petrify', petrifyId, goblinId],
      ['curse', curseId, goblinId], ['impSword', swordId, impId], ['impFlame', flameId, impId],
    ];
    for (const [name, propId, targetId] of plays) {
      const actionId = await insert(player, lyraId, propTask(propId, [targetId]));
      actionIds[name] = actionId;
      await steadySeed(actionId);
      for (let cursor = 0; cursor < 6; cursor += 1) {
        await call(player, 'actions.drawDice', { actionId, cursor, dice: [{ number: 1, diceSize: 20 }] });
      }
      await call(player, 'actions.runAction', { actionId, decisions: [] });
    }
    // Everything written reaches both
    const logged = (connection: Connection, creatureId: string, actionId: string) => connection.messages.some(
      message => message.collection === 'creatureLogs' && message.fields?.creatureId === creatureId
        && message.fields?.actionId === actionId,
    );
    for (let i = 0; i < 100; i += 1) {
      if (Object.values(actionIds).every(id => logged(player, lyraId, id))
        && logged(gm, goblinId, actionIds.curse) && logged(gm, impId, actionIds.impFlame)) break;
      await pause(100);
    }
    await pause(500);
  });

  after(() => {
    player?.close();
    gm?.close();
  });

  it('sends the player none of the monster\'s values, in any frame', function () {
    const raw = withoutDates(player.messages);
    for (const canary of CANARIES) assert.notInclude(raw, canary, `the player received "${canary}"`);
    // Nor how the lines show to whom: the views stay in memory
    assert.notInclude(raw, 'targetView');
    assert.notInclude(raw, 'hiddenTargetView');
    // The search proves something: the player's entries did arrive
    assert.include(raw, 'Goblin 2 · Failed save');
  });

  it('sends none of the monster\'s variables, and none of its properties but its conditions', function () {
    const goblins = (message: any) => message.fields?._creatureId === goblinId || message.fields?.root?.id === goblinId;
    assert.isEmpty(player.messages.filter(message => message.collection === 'creatureVariables' && goblins(message)));
    const properties = player.messages.filter(message => message.collection === 'creatureProperties' && goblins(message));
    assert.isNotEmpty(properties, 'its condition, which the board shows');
    for (const property of properties) {
      assert.equal(property.fields.type, 'buff');
      assert.equal(property.fields.name, 'Poisoned', 'its condition alone');
    }
    // Its log, the game master's, never
    assert.isEmpty(player.messages.filter(message => message.collection === 'creatureLogs'
      && message.fields?.creatureId === goblinId));
    // Nor any action's seed
    assert.notInclude(text(player.messages.filter(message => message.collection === 'actions')), '"seed"');
  });

  it('tells the player hit and the damage dealt, from their own roll, without the armor class or hit points', async function () {
    const log = await logOf(actionIds.sword, lyraId);
    assert.includeMembers(log.content.map((line: any) => line.name), ['Sword', 'Hit!', 'Damage', 'Struck']);
    assert.equal(lineNamed(log, 'Sword').value, 'A fine blade', 'the action\'s own summary, whole');
    assert.match(lineNamed(log, 'Hit!').value, /^1d20 \[\d+\] \+ 300000\n\*\*3000\d\d\*\*$/, 'their own roll, whole');
    assert.include(lineNamed(log, 'Damage').value, '**7** slashing damage', 'the damage dealt');
    assert.equal(lineNamed(log, 'Struck').value, 'Left 0 of 0', '~attributeDamaged holds the hit points\' id alone');
    assert.notInclude(text(log), 'Hit Points');
    // The goblin took it all the same: 7 slashing, then 5 radiant halved
    assert.equal(await damageOf(goblinHpId), 7 + 2);
  });

  it('tells the player whose saving throw failed, without its roll, and the damage dealt with its resistance', async function () {
    const log = await logOf(actionIds.flame, lyraId);
    const save = log.content.find((line: any) => line.i18n?.name?.key === 'logs.forTarget');
    assert.equal(save.name, 'Goblin 2 · Failed save');
    assert.notProperty(save, 'value', 'the name and the result alone');
    assert.equal(translateLogLine(save, translatorFor('fr')).name, 'Goblin 2 · Sauvegarde ratée');
    assert.include(text(log), 'DC **15**', 'their own DC');
    const damage = lineNamed(log, 'Damage');
    assert.include(damage.value, 'Resistant to radiant damage', 'Q3: the resistance, which the number gives away');
    assert.include(damage.value, '**2** radiant damage');
    assert.equal(lineNamed(log, 'Flame roll').value, 'Rolled 0 with 0', 'no ~saveRoll nor ~saveDiceRoll in their scope');
    assert.isUndefined(lineNamed(log, 'Dodged'), 'the server decided: failed');
  });

  it('tells the player nothing of what the monster\'s sheet lacks, or of its stats, effects and buffs', async function () {
    const charm = await logOf(actionIds.charm, lyraId);
    assert.deepEqual(charm.content.map((line: any) => line.name), ['Charm', 'Charm'], 'the action, its DC; no "no saving throw"');
    const hex = await logOf(actionIds.hex, lyraId);
    assert.equal(lineNamed(hex, 'Hex').value, 'Hexed Goblin 2: 0 0 0', '~target, its name alone');
    const dispel = await logOf(actionIds.dispel, lyraId);
    assert.sameMembers(dispel.content.filter((line: any) => line.name === 'Removed').map((line: any) => line.value),
      ['Poisoned', 'An effect'], 'a condition by its name, any other effect unnamed');
    assert.equal(translateLogLine(dispel.content.find((line: any) => line.value === 'An effect'), translatorFor('fr')).value,
      'Un effet');
    // An adjustment: what the player applied, the stat's name and their own
    // number, never the stat's value; a stat it lacks: the action alone
    const applied = async (name: string) => (await logOf(actionIds[name], lyraId)).content
      .filter((line: any) => line.targetIds?.includes(goblinId) && line.value).map((line: any) => line.value);
    assert.deepEqual(await applied('enfeeble'), ['Strength \u22122'], 'a decrease');
    assert.deepEqual(await applied('empower'), ['Strength +3'], 'an increase');
    assert.deepEqual(await applied('petrify'), ['Strength set to 10'], 'a set, to the player\'s own value');
    const petrify = (await logOf(actionIds.petrify, lyraId)).content.find((line: any) => line.value === 'Strength set to 10');
    assert.equal(translateLogLine(petrify, translatorFor('fr')).value, 'Valeur de Strength fixée à 10');
    for (const name of ['enfeeble', 'empower', 'petrify']) {
      assert.lengthOf((await logOf(actionIds[name], lyraId)).content, 2, `${name}: the action and what it applied, nothing else`);
    }
    assert.deepEqual((await logOf(actionIds.curse, lyraId)).content.map((line: any) => line.name), ['Curse'],
      'a stat it lacks: the action alone, no "does not have"');
    // Both happened all the same
    assert.equal(await CreatureProperties.find({ 'root.id': goblinId, name: { $in: ['SECRET-SEAL', 'Poisoned'] }, removed: true })
      .countAsync(), 2);
  });

  it('tells the player nothing of a monster with no armor class nor saving throw: their roll alone', async function () {
    const sword = await logOf(actionIds.impSword, lyraId);
    assert.deepEqual(sword.content.map((line: any) => line.name), ['Sword', 'To hit']);
    assert.match(lineNamed(sword, 'To hit').value, /\*\*3000\d\d\*\*/);
    const flame = await logOf(actionIds.impFlame, lyraId);
    assert.deepEqual(flame.content.map((line: any) => line.name), ['Sacred Flame', 'Sacred Flame', 'Flame roll']);
  });

  it('gives the game master everything in the monsters\' own logs', function () {
    const gmRaw = withoutDates(gm.messages);
    for (const value of [
      '161803', 'SECRET-SEAL', 'SECRET-TRIGGER: hurt by 7', 'logs.noSave', 'does not have', 'logs.concentrationCheck',
      'logs.attributeDamaged', 'logs.noArmor',
      // The +3 capped at its total: the player read "+3", their own number
      'Strength set from 141421 to 10',
    ]) {
      assert.include(gmRaw, value, `the game master reads "${value}"`);
    }
  });
});

/*
 * The browser's simulation of an action on a hidden target: it has none of
 * the target's stats, and leaves what the target does to the server. It
 * guesses nothing: no hit nor miss, no saving throw, no damage, no change to
 * the target; what the client's stub of runAction would write locally
 */
if (Meteor.isServer) describe('The browser\'s simulation of an action on the game master\'s monster', function () {
  this.timeout(60000);
  before(setUp);
  after(tearDown);

  // The client's dice, counted
  function counting(): InputProvider & { rolled: number } {
    const provider = {
      ...clientInputProvider,
      rolled: 0,
      async rollDice(dice: { number: number, diceSize: number }[]) {
        provider.rolled += dice.reduce((total, { number }) => total + number, 0);
        return clientInputProvider.rollDice(dice);
      },
    };
    return provider;
  }
  const lines = (action: EngineAction) => allMutations(action, { withMessages: true })
    .flatMap(mutation => (mutation.contents || []).map(line => ({ ...line, targetIds: mutation.targetIds })));
  const writesTo = (action: EngineAction, creatureId: string) => allMutations(action).filter(mutation =>
    mutation.targetIds.includes(creatureId) && (mutation.updates?.length || mutation.inserts?.length || mutation.removals?.length));

  it('logs the attack\'s roll, "result at resolution", and applies neither hit nor miss', async function () {
    const action = await runActionById(swordId, [goblinId], counting());
    const attack = lines(action).find(line => line.i18n?.value?.some((part: any) => part?.key === 'logs.vsHidden'));
    assert.exists(attack, 'the roll, result at resolution');
    assert.equal(attack!.name, 'To hit');
    assert.match(attack!.value!, /\*\*3000\d\d\*\*, result at resolution$/);
    assert.equal(translateLogLine(attack!, translatorFor('fr')).name, 'Attaque');
    assert.match(translateLogLine(attack!, translatorFor('fr')).value!, /résultat à la résolution$/);
    assert.notInclude(lines(action).map(line => line.name), 'Hit!');
    assert.notInclude(lines(action).map(line => line.name), 'Struck', 'no hit branch');
    assert.notInclude(lines(action).map(line => line.name), 'Missed', 'no miss branch');
    assert.isEmpty(writesTo(action, goblinId), 'nothing written on a guess');
    assert.equal(attack!.hiddenTargetView, WHOLE, 'the actor\'s readers read it');
  });

  it('logs the saving throw "at resolution", rolling none of the monster\'s dice, and applies no branch', async function () {
    const provider = counting();
    const action = await runActionById(flameId, [goblinId], provider);
    const save = lines(action).find(line => line.i18n?.name?.key === 'logs.forTarget');
    assert.equal(save?.name, 'Goblin 2 · Saving throw: at resolution');
    assert.equal(translateLogLine(save!, translatorFor('fr')).name, 'Goblin 2 · Sauvegarde : à la résolution');
    assert.equal(provider.rolled, 0, 'no die for the monster');
    assert.notInclude(lines(action).map(line => line.name), 'Damage');
    assert.notInclude(lines(action).map(line => line.name), 'Dodged');
    assert.isEmpty(writesTo(action, goblinId));
  });

  it('copies no buff, removes nothing, changes no stat on the monster, deals it no damage', async function () {
    for (const propId of [hexId, dispelId, enfeebleId, curseId, sparkId]) {
      const action = await runActionById(propId, [goblinId], counting());
      assert.isEmpty(writesTo(action, goblinId), propId);
    }
    // The damage dealt, as rolled: its resistances are the server's to read
    const spark = lines(await runActionById(sparkId, [goblinId], counting())).find(line => line.name === 'Damage');
    assert.equal(spark?.value, '**4** radiant damage');
    const hex = lines(await runActionById(hexId, [goblinId], counting())).find(line => line.name === 'Hex');
    assert.equal(hex?.value, 'Hexed Goblin 2: 0 0 0', 'nothing of the monster read but its name');
  });

  it('resolves a player\'s character it may read as before', async function () {
    const action = await runActionById(swordId, [ariaId], counting());
    assert.include(lines(action).map(line => line.name), 'Hit!');
    assert.isNotEmpty(writesTo(action, ariaId), 'its hit points');
  });
});

/*
 * The server replays the decisions by kind: dice never, the choices,
 * advantages and check options each from their own queue. A path that rolls
 * more dice than the browser's simulation (a hit it could not see) no
 * longer shifts the choices that follow
 */
if (Meteor.isServer) describe('Decisions replayed by kind', function () {
  this.timeout(60000);
  before(setUp);
  after(tearDown);

  // The browser's simulation, the user picking the second option
  async function simulate(actionId: string) {
    const action = await EngineActions.findOneAsync(actionId) as EngineAction;
    delete action.seed;
    await applyAction(action, {
      ...clientInputProvider,
      async choose(choices) {
        return [choices[choices.length - 1]._id];
      },
    }, { simulate: true });
    return action._decisions || [];
  }

  it('applies the player\'s choice after a hit the browser could not see', async function () {
    const actionId = await execute(insertAction, playerId, { action: { creatureId: lyraId, task: propTask(trickId, [goblinId]), results: [], taskCount: 0 } });
    await steadySeed(actionId);
    const decisions = await simulate(actionId);
    assert.sameMembers(decisions.map(decision => decision.kind), ['advantage', 'rollDice', 'choose']);
    await execute(runAction, playerId, { actionId, decisions });
    const log = await logOf(actionId, lyraId);
    const names = log.content.map((line: any) => line.name);
    assert.include(names, 'Hit!');
    assert.include(names, 'Damage', 'the hit\'s dice, which the browser never drew');
    assert.include(names, 'Went right', 'the choice made');
    assert.notInclude(names, 'Went left');
  });

  it('leaves a choice the browser never saw unmade, and says so', async function () {
    const actionId = await execute(insertAction, playerId, { action: { creatureId: lyraId, task: propTask(ambushId, [goblinId]), results: [], taskCount: 0 } });
    await steadySeed(actionId);
    const decisions = await simulate(actionId);
    assert.notInclude(decisions.map(decision => decision.kind), 'choose');
    await execute(runAction, playerId, { actionId, decisions });
    const log = await logOf(actionId, lyraId);
    const unmade = log.content.find((line: any) => line.i18n?.name?.key === 'logs.choiceNotMade');
    assert.exists(unmade, text(log.content.map((line: any) => [line.name, line.value])));
    assert.equal(unmade.value, 'Stab, Slash');
    assert.notInclude(log.content.map((line: any) => line.name), 'Stab');
  });

  it('refuses decisions without their kind', async function () {
    const actionId = await execute(insertAction, playerId, { action: { creatureId: lyraId, task: propTask(trickId, [goblinId]), results: [], taskCount: 0 } });
    await steadySeed(actionId);
    const error = await refusal((async () => execute(runAction, playerId, { actionId, decisions: [0, [[20]], ['x']] }))());
    assert.match(String(error?.message), /Match error/);
    const forged = await refusal((async () => execute(runAction, playerId, {
      actionId, decisions: [{ kind: 'rollHiddenDice', value: [[1]] }],
    }))());
    assert.match(String(forged?.message), /Match error/);
    assert.equal(await CreatureLogs.find({ actionId }).countAsync(), 0);
  });

  it('takes the suggested advantage and check options when the queue runs out, a choice\'s ids alone', async function () {
    const actionId = await execute(insertAction, playerId, { action: { creatureId: lyraId, task: propTask(trickId, [goblinId]), results: [], taskCount: 0 } });
    await steadySeed(actionId);
    // Nonsense values: an advantage of 5, a choice of numbers
    await execute(runAction, playerId, {
      actionId, decisions: [{ kind: 'advantage', value: 5 }, { kind: 'choose', value: [1, 2] }],
    });
    const log = await logOf(actionId, lyraId);
    assert.include(log.content.map((line: any) => line.name), 'Hit!', 'no advantage, as suggested');
    assert.notInclude(log.content.map((line: any) => line.name), 'Went right');
    assert.notInclude(log.content.map((line: any) => line.name), 'Went left');
  });
});

/*
 * The dice the server rolls for a hidden target come from a stream of their
 * own, HMAC(seed, "h:<targetId>:<n>"), which drawDice never serves: the
 * player cannot draw the monster's d20 in advance, and their own dice keep
 * their positions whether the monster rolls or not
 */
if (Meteor.isServer) describe('A hidden target\'s dice', function () {
  this.timeout(60000);
  before(setUp);
  after(tearDown);

  it('rolls the monster\'s saving throw apart, the actor\'s dice at the positions the player drew', async function () {
    const actionId = await execute(insertAction, playerId, {
      action: { creatureId: lyraId, task: propTask(burnId, [goblinId]), results: [], taskCount: 0 },
    });
    // A seed whose streams tell the positions apart: the goblin's first d20
    // is not the actor's first, nor the actor's first d100 its second
    let seed = '';
    for (let i = 0; !seed; i += 1) {
      // One seed in twenty fits, unless the streams are one
      if (i >= 1000) assert.fail('no seed tells the goblin\'s stream from the actor\'s');
      const candidate = `monster-targeting-seed-${i}`;
      if (actionDice.hiddenDie(candidate, goblinId, 0, 20) !== actionDice.seededDie(candidate, 0, 20)
        && actionDice.seededDie(candidate, 0, 100) !== actionDice.seededDie(candidate, 1, 100)) seed = candidate;
    }
    await EngineActions.updateAsync(actionId, { $set: { seed } });
    // The player draws the first dice, as their browser does
    const drawn = await execute(drawDice, playerId, {
      actionId, cursor: 0, dice: [{ number: 1, diceSize: 100 }],
    });
    await execute(runAction, playerId, { actionId, decisions: [] });
    const goblinLog = await logOf(actionId, goblinId);
    const save = goblinLog.content.find((line: any) => line.i18n?.name?.key === 'logs.saveFailed');
    assert.equal(Number(/1d20 \[ (\d+) \]/.exec(save.value)?.[1]), actionDice.hiddenDie(seed, goblinId, 0, 20),
      'the goblin\'s d20 from its own stream');
    const damage = (await logOf(actionId, lyraId)).content.find((line: any) => line.name === 'Damage');
    assert.equal(Number(/^1d100 \[\s*(\d+)\s*\]/.exec(damage.value)?.[1]), drawn[0][0], 'the d100 the player drew, at its first position');
    assert.equal(drawn[0][0], actionDice.seededDie(seed, 0, 100));
  });

  it('never serves the hidden stream through the actor\'s positions', function () {
    const seed = 'a-seed';
    // Dice of 2^40 faces: the same value twice by chance is out of reach
    const faces = 2 ** 40;
    const actors = new Set(actionDice.drawSeededDiceAt(seed, 0, Array.from({ length: 10 }, () => ({ number: 100, diceSize: faces }))).flat());
    for (let n = 0; n < 50; n += 1) {
      assert.isFalse(actors.has(actionDice.hiddenDie(seed, goblinId, n, faces)), `the goblin's die ${n}`);
    }
    // Each target its own stream, each die its own
    assert.notEqual(actionDice.hiddenDie(seed, goblinId, 0, faces), actionDice.hiddenDie(seed, impId, 0, faces));
    assert.notEqual(actionDice.hiddenDie(seed, goblinId, 0, faces), actionDice.hiddenDie(seed, goblinId, 1, faces));
  });

  it('counts each target\'s dice apart', async function () {
    const roll = actionDice.getHiddenDiceRoller({ _id: 'x', seed: 'a-seed' });
    assert.deepEqual(await roll(goblinId, [{ number: 2, diceSize: 20 }]), [[
      actionDice.hiddenDie('a-seed', goblinId, 0, 20), actionDice.hiddenDie('a-seed', goblinId, 1, 20),
    ]]);
    assert.deepEqual(await roll(impId, [{ number: 1, diceSize: 20 }]), [[actionDice.hiddenDie('a-seed', impId, 0, 20)]]);
    assert.deepEqual(await roll(goblinId, [{ number: 1, diceSize: 20 }]), [[actionDice.hiddenDie('a-seed', goblinId, 2, 20)]]);
  });
});

/*
 * Whom a player may target: the game master's monsters and non-player
 * characters of the table too, unless the game master turned it off; the
 * same tasks as for the other players' characters (2.2)
 */
if (Meteor.isServer) describe('The game master\'s switch: players target the monsters', function () {
  this.timeout(60000);
  before(setUp);
  after(tearDown);

  let player: Connection;
  let gm: Connection;
  before(async function () {
    player = await openAs(playerId);
    gm = await openAs(gmId);
  });
  after(() => {
    player?.close();
    gm?.close();
  });

  const folderMessages = (connection: Connection) => connection.messages.filter(message =>
    message.collection === 'creatureFolders' && message.id === folderId && 'playersTargetMonsters' in (message.fields || {}));

  it('lets a player target the monsters and non-player characters of the board by default', async function () {
    for (const targetId of [goblinId, innkeeperId]) {
      assert.isString(await insert(player, lyraId, propTask(swordId, [targetId])));
    }
    // Never a monster of someone else's, nor a check or a rest on the goblin
    const stray = await refusal(insert(player, lyraId, propTask(swordId, [strayMonsterId])));
    assert.equal(stray?.details?.i18n?.key, DENIED);
    for (const task of [
      { subtaskFn: 'reset', targetIds: [goblinId], eventName: 'longRest' },
      { subtaskFn: 'check', targetIds: [goblinId], abilityVariableName: 'strength', dc: 30 },
      { subtaskFn: 'dealDamage', targetIds: [goblinId], params: { amount: 9999 } },
    ]) {
      const error = await refusal(insert(player, lyraId, task));
      assert.equal(error?.details?.i18n?.key, DENIED, task.subtaskFn);
    }
  });

  it('refuses the switch to a player, and lets the game master turn it off and on', async function () {
    const denied = await refusal(call(player, 'creatureFolders.setPlayersTargetMonsters', { folderId, playersTargetMonsters: false }));
    assert.equal(denied?.error, 'monsters.denied');
    assert.notProperty(await CreatureFolders.findOneAsync(folderId), 'playersTargetMonsters');
    await call(gm, 'creatureFolders.setPlayersTargetMonsters', { folderId, playersTargetMonsters: false });
    assert.isFalse((await CreatureFolders.findOneAsync(folderId)).playersTargetMonsters);
    await call(gm, 'creatureFolders.setPlayersTargetMonsters', { folderId, playersTargetMonsters: true });
    assert.notProperty(await CreatureFolders.findOneAsync(folderId), 'playersTargetMonsters', 'on: absent');
  });

  it('publishes it to the players, whose target picker reads it: their character\'s parties, and the board', async function () {
    // Each publication alone, on a connection of its own
    const sheet = await openAs(playerId);
    const board = await openAs(playerId);
    try {
      await sheet.subscribe('characterParties', lyraId);
      await board.subscribe('partyBoard', folderId);
      await call(gm, 'creatureFolders.setPlayersTargetMonsters', { folderId, playersTargetMonsters: false });
      for (const connection of [sheet, board]) {
        for (let i = 0; i < 50 && !folderMessages(connection).length; i += 1) await pause(100);
        assert.isFalse(folderMessages(connection).at(-1)?.fields.playersTargetMonsters);
      }
    } finally {
      sheet.close();
      board.close();
      await call(gm, 'creatureFolders.setPlayersTargetMonsters', { folderId, playersTargetMonsters: true });
    }
  });

  it('refuses the monsters once it is off, at insertion and at run', async function () {
    const actionId = await insert(player, lyraId, propTask(swordId, [goblinId]));
    const before = await damageOf(goblinHpId);
    await call(gm, 'creatureFolders.setPlayersTargetMonsters', { folderId, playersTargetMonsters: false });
    try {
      const atRun = await refusal(call(player, 'actions.runAction', { actionId, decisions: [] }));
      assert.equal(atRun?.details?.i18n?.key, DENIED, 'turned off while the action was under way');
      assert.equal(await damageOf(goblinHpId), before, 'the goblin untouched');
      assert.equal(await CreatureLogs.find({ actionId }).countAsync(), 0);
      for (const targetId of [goblinId, innkeeperId]) {
        const error = await refusal(insert(player, lyraId, propTask(swordId, [targetId])));
        assert.equal(error?.details?.i18n?.key, DENIED);
      }
      // The players' characters still
      assert.isString(await insert(player, lyraId, propTask(swordId, [ariaId])));
    } finally {
      await call(gm, 'creatureFolders.setPlayersTargetMonsters', { folderId, playersTargetMonsters: true });
    }
  });

  it('says it in English and French', function () {
    for (const key of [
      'monsters.playersTarget', 'monsters.playersTargetHint', 'logs.vsHidden', 'logs.saveAtResolution', 'logs.anEffect',
      'logs.adjusted', 'logs.adjustedTo',
    ]) {
      assert.isString(get(en, key), key);
      assert.isString(get(fr, key), key);
    }
    // French typography: a no-break space before a colon, a narrow one before a semicolon
    assert.include(get(fr, 'logs.saveAtResolution'), ' :');
    assert.include(get(fr, 'monsters.playersTargetHint'), ' ;');
  });
});

if (Meteor.isServer) describe('The party\'s rule for the monsters (partyTargetable)', function () {
  const folder = { _id: folderId, owner: gmId, members: [playerId], creatures: [lyraId, goblinId, innkeeperId, strayMonsterId] };
  const lyraPc = { _id: lyraId, owner: playerId, type: 'pc' };
  const goblinMonster = { _id: goblinId, owner: gmId, type: 'monster' };
  const innkeeperNpc = { _id: innkeeperId, owner: gmId, type: 'npc' };

  it('lets the table target the game master\'s monsters and non-player characters, unless turned off', function () {
    assert.isTrue(partyTargetable(folder, playerId, goblinMonster));
    assert.isTrue(partyTargetable(folder, playerId, innkeeperNpc));
    assert.isTrue(partyLetsTarget(folder, playerId, lyraPc, goblinMonster));
    assert.isTrue(partyTargetable({ ...folder, playersTargetMonsters: true }, playerId, goblinMonster));
    const off = { ...folder, playersTargetMonsters: false };
    assert.isFalse(partyTargetable(off, playerId, goblinMonster));
    assert.isFalse(partyTargetable(off, playerId, innkeeperNpc));
    assert.isFalse(partyLetsTarget(off, playerId, lyraPc, goblinMonster));
    assert.isTrue(partyTargetable(off, playerId, lyraPc), 'the characters still');
  });

  it('never a monster of someone else\'s, nor outside the folder or the table', function () {
    assert.isFalse(partyTargetable(folder, playerId, { _id: strayMonsterId, owner: outsiderId, type: 'monster' }));
    assert.isFalse(partyTargetable(folder, playerId, { _id: strayMonsterId, owner: playerId, type: 'monster' }), 'a player\'s');
    assert.isFalse(partyTargetable(folder, playerId, { _id: impId, owner: gmId, type: 'monster' }), 'not in the folder');
    assert.isFalse(partyTargetable(folder, outsiderId, goblinMonster), 'not at the table');
    assert.isFalse(partyTargetable({ ...folder, archived: true }, playerId, goblinMonster));
  });
});

/*
 * What the players read of a line about a creature hidden from them, and of
 * a line whose actor is hidden too (logViews.ts)
 */
describe('A line as its readers see it (seenBy)', function () {
  const line = (views: object): { name?: string, value?: string, targetIds: string[] } => ({
    name: 'Line', value: 'Its value', targetIds: ['goblin'], ...views,
  });

  it('shows a line about none of the hidden whole, without its views', function () {
    assert.deepEqual(seenBy(line({ targetView: { name: 'x' } }), { hiddenIds: ['other'] }),
      { name: 'Line', value: 'Its value', targetIds: ['goblin'] });
  });

  it('shows a line about a hidden creature as its hiddenTargetView says, and drops it without one', function () {
    assert.isUndefined(seenBy(line({}), { hiddenIds: ['goblin'] }));
    assert.deepEqual(seenBy(line({ hiddenTargetView: WHOLE }), { hiddenIds: ['goblin'] }),
      { name: 'Line', value: 'Its value', targetIds: ['goblin'] });
    assert.deepEqual(seenBy(line({ hiddenTargetView: { name: 'Shown' } }), { hiddenIds: ['goblin'] }),
      { name: 'Shown', targetIds: ['goblin'] });
  });

  it('combines both views when the actor is hidden too, whole views only', function () {
    const both = { actorHidden: true, hiddenIds: ['goblin'] };
    assert.deepEqual(seenBy(line({ targetView: WHOLE, hiddenTargetView: { name: 'A' } }), both), { name: 'A', targetIds: ['goblin'] });
    assert.deepEqual(seenBy(line({ targetView: { name: 'B' }, hiddenTargetView: WHOLE }), both), { name: 'B', targetIds: ['goblin'] });
    assert.isUndefined(seenBy(line({ targetView: { name: 'B' }, hiddenTargetView: { name: 'A' } }), both));
    assert.isUndefined(seenBy(line({ targetView: WHOLE }), both));
  });
});

/*
 * A player's breath on another player's character and the monster: the other
 * character's entry has its own lines whole, and nothing of the monster
 */
if (Meteor.isServer) describe('A player\'s action on another character and a monster at once', function () {
  this.timeout(60000);
  before(setUp);
  after(tearDown);

  it('gives the other character its lines whole, nothing of the monster\'s, and the actor the results', async function () {
    const actionId = await execute(insertAction, playerId, {
      action: { creatureId: lyraId, task: propTask(breathId, [goblinId, ariaId]), results: [], taskCount: 0 },
    });
    await execute(runAction, playerId, { actionId, decisions: [] });
    const ariaLog = await logOf(actionId, ariaId);
    assert.equal(ariaLog.content[0].name, 'Lyra → you');
    assert.include(ariaLog.content.map((line: any) => line.name), 'Thunder Breath', 'the title, about both');
    assert.include(ariaLog.content.map((line: any) => line.name), 'Failed save', 'her own saving throw, whole');
    assert.include(text(ariaLog), '−3 Hit Points', 'her own hit points');
    for (const canary of VALUES) assert.notInclude(withoutDates(ariaLog), canary);
    assert.notInclude(text(ariaLog), 'Goblin 2');
    const lyraLog = await logOf(actionId, lyraId);
    const names = lyraLog.content.map((line: any) => line.name);
    assert.include(names, 'Goblin 2 · Failed save', 'named once');
    assert.include(names, 'Aria · Failed save');
    for (const canary of VALUES) assert.notInclude(withoutDates(lyraLog), canary);
    // The hit points' lines of the other character alone
    for (const line of lyraLog.content.filter((content: any) => /Hit Points/.test(content.value || ''))) {
      assert.deepEqual(line.targetIds, [ariaId]);
    }
    assert.notInclude(text((await latestLog(ariaId))), 'Goblin 2 · ');
    assert.isAbove(await damageOf(ariaHpId), 0);
  });

  it('keeps a line about both that says nothing of how it shows out of the players\' entries, a line added later', async function () {
    // As a property the engine does not mark yet would log it
    const result = new TaskResult([goblinId, ariaId]);
    result.mutations.push(
      { targetIds: [goblinId, ariaId], contents: [{ name: 'SECRET-LINE', value: 'about both' }] },
      { targetIds: [ariaId], contents: [{ name: 'Aria alone', value: 'hers', hiddenTargetView: WHOLE }] },
    );
    const action: EngineAction = {
      _id: Random.id(), creatureId: lyraId, task: { prop: { _id: breathId } as any, targetIds: [goblinId, ariaId] },
      results: [result], taskCount: 0,
    };
    await writeActionResults(action);
    const ariaLog = await logOf(action._id!, ariaId);
    assert.include(text(ariaLog), 'Aria alone');
    assert.notInclude(text(ariaLog), 'SECRET-LINE', 'the other character\'s entry');
    assert.notInclude(text(await logOf(action._id!, lyraId)), 'SECRET-LINE', 'the actor\'s entry');
    assert.include(text(await logOf(action._id!, goblinId)), 'SECRET-LINE', 'the game master\'s');
  });
});

/*
 * The party's Discord channel gets Lyra's attack on the goblin once, as her
 * log says it: the result and the damage dealt, never the goblin's values;
 * the goblin's own entry never
 */
if (Meteor.isServer) describe('A player\'s character attacking the monster: the party\'s Discord channel', function () {
  this.timeout(60000);
  const PARTY = { id: '1100000000000000031', token: 'party-token' };
  const url = (webhook: { id: string, token: string }) => `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`;
  let fake: FakeDiscord;
  let sender: WebhookSender;
  let previous: WebhookSender | undefined;

  before(async function () {
    await setUp();
    fake = await fakeDiscord();
    sender = createWebhookSender({ baseUrl: fake.baseUrl, onGone: forgetWebhook });
    previous = setWebhookSender(sender);
    await (setPartyWebhook as any)._execute({ userId: gmId }, { folderId, webhook: url(PARTY) });
  });

  after(async function () {
    await discordIntakeIdle();
    await sender.idle();
    setWebhookSender(previous);
    await fake.close();
    await tearDown();
  });

  it('posts "Hit!" and the damage dealt once, under the character, without the monster\'s values', async function () {
    const seen = fake.requests.length;
    for (const propId of [swordId, flameId, hexId, dispelId]) {
      const actionId = await execute(insertAction, playerId, {
        action: { creatureId: lyraId, task: propTask(propId, [goblinId]), results: [], taskCount: 0 },
      });
      await steadySeed(actionId);
      await execute(runAction, playerId, { actionId, decisions: [] });
    }
    await discordIntakeIdle();
    await sender.idle();
    const posts = fake.requests.slice(seen).filter(request => request.method !== 'GET' && request.webhookId === PARTY.id)
      .map(request => request.body);
    assert.lengthOf(posts, 4, 'one message per action, Lyra\'s entry: never the goblin\'s');
    for (const post of posts) assert.equal(post.username, 'Lyra');
    assert.include(text(posts[0]), 'Hit!');
    assert.include(text(posts[0]), '**7** slashing damage');
    assert.include(text(posts[1]), 'Goblin 2 · Failed save');
    for (const canary of CANARIES) assert.notInclude(withoutDates(posts), canary);
  });
});
