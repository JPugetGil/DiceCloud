import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { get } from 'lodash';
import CreatureFoldersCollection from '/imports/api/creature/creatureFolders/CreatureFolders';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import Creatures from '/imports/api/creature/creatures/Creatures';
import EngineActions from '/imports/api/engine/action/EngineActions';
import {
  createTestCreature, getRandomIds, removeAllCreaturesAndProps, runActionById, type TestCreature,
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import writeActionResults from '/imports/api/engine/action/functions/writeActionResults';
import { insertAction } from '/imports/api/engine/action/methods/insertAction';
import { MAX_FOREIGN_BUFF_PROPERTIES } from '/imports/api/engine/action/applyProperties/applyBuffProperty';
import { reloadCachedProperties } from '/imports/api/engine/loadCreatures';
import computeCreature from '/imports/api/engine/computeCreature';
import { openAs, refusal } from '/imports/api/utility/ddpClient.testFn';
import { partyLetsTarget, partyTargetable } from '/imports/api/creature/creatureFolders/party';
import {
  logLineTone, msg, logLine, namingTargets, translateLogLine, withoutHiddenStats,
} from '/imports/api/creature/log/logMessages';
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

if (Meteor.isServer) {
  // Unit tests load no entry point: the publications and the methods register here
  /* eslint-disable @typescript-eslint/no-require-imports */
  require('/imports/api/creature/creatureFolders/server/publications/partyBoard');
  require('/imports/api/creature/creatures/server/publications/singleCharacter');
  require('/imports/startup/server/publicationStrategies');
  require('/imports/api/engine/action/methods/index');
  require('/imports/api/creature/creatureFolders/methods/index');
  /* eslint-enable @typescript-eslint/no-require-imports */
}

/*
 * Phase 2.2 of the monsters: during play, whoever sits at a party's table
 * may apply an action or a spell of their character to the table's other
 * player characters, whose sheets they may not edit: Aria heals Lyra. Never
 * a check, a rest, an attribute changed or damage typed in; never the game
 * master's monsters once the game master turned that off (phase 2.3); never a
 * creature of someone outside the table; and not once they left the party,
 * even with the action under way.
 * Through DDP, as a browser calls the methods.
 */

// The game master, Aria's and Lyra's players, and a player of no party
const [gmId, ariaPlayerId, lyraPlayerId, outsiderId] = getRandomIds(4);
const [folderId, oldFolderId] = getRandomIds(2);
const [ariaId, lyraId, goblinId, npcId, gmHeroId, strayId, zedId, ariaTooId, longId] = getRandomIds(9);
const [
  cureId, castId, blessId, bigBuffId, hugeBuffId, zedCureId, ariaTooCureId, breathId, lyraHpId, gmHeroHpId,
  ariaHpId, ammoActionId, arrowId, longCureId, doomId, dispelId, curseId, holdId,
] = getRandomIds(18);

const hitPoints = (_id: string | undefined, total: number) => ({
  ...(_id && { _id }), type: 'attribute', name: 'Hit Points', attributeType: 'healthBar', variableName: 'hitPoints',
  baseValue: { calculation: String(total) },
}) as any;
const dexteritySave = (bonus: number) => ({
  type: 'skill', skillType: 'save', name: 'Dexterity Save', variableName: 'dexteritySave',
  baseValue: { calculation: String(bonus) },
}) as any;
const cure = (_id: string) => ({
  _id, type: 'action', name: 'Cure Wounds', target: 'singleTarget',
  children: [{ type: 'damage', target: 'target', damageType: 'healing', amount: { calculation: '7' } }],
}) as any;
// A buff of `count` properties, itself included
const buffOf = (_id: string, name: string, count: number) => ({
  _id, type: 'buff', name, target: 'target',
  children: Array.from({ length: count - 1 }, (_, i) => ({ type: 'note', name: `${name} note ${i + 1}` })),
}) as any;

// Joining a party made the game master an editor of its characters (writers)
const aria: TestCreature = {
  _id: ariaId, name: 'Aria', owner: ariaPlayerId, type: 'pc', writers: [gmId],
  props: [
    hitPoints(ariaHpId, 20000),
    dexteritySave(1),
    cure(cureId),
    {
      _id: castId, type: 'spell', name: 'Healing Word', level: 1, target: 'singleTarget',
      children: [{ type: 'damage', target: 'target', damageType: 'healing', amount: { calculation: '4' } }],
    } as any,
    buffOf(blessId, 'Bless', 3),
    buffOf(bigBuffId, 'Big Blessing', MAX_FOREIGN_BUFF_PROPERTIES),
    buffOf(hugeBuffId, 'Huge Blessing', MAX_FOREIGN_BUFF_PROPERTIES + 1),
    { _id: arrowId, type: 'item', name: 'Arrow', quantity: 20 } as any,
    { _id: ammoActionId, type: 'action', name: 'Shoot', target: 'singleTarget' } as any,
    // Writes on the target, which another's creature refuses (C5): sets its
    // hit points, strips its buffs, or carries a buff that sets them
    {
      _id: doomId, type: 'action', name: 'Doom', target: 'singleTarget',
      children: [{ type: 'adjustment', target: 'target', stat: 'hitPoints', operation: 'set', amount: { calculation: '0' } }],
    } as any,
    {
      _id: dispelId, type: 'action', name: 'Dispel', target: 'singleTarget',
      children: [{ type: 'buffRemover', name: 'Dispel', target: 'target', removeAll: true }],
    } as any,
    {
      _id: curseId, type: 'action', name: 'Curse', target: 'singleTarget',
      children: [{
        type: 'buff', name: 'Cursed', target: 'target',
        children: [{ type: 'adjustment', target: 'self', stat: 'hitPoints', operation: 'set', amount: { calculation: '1' } }],
      }],
    } as any,
    // A condition that ends itself on a save, as the bestiary's: allowed
    {
      _id: holdId, type: 'action', name: 'Hold', target: 'singleTarget',
      children: [{
        type: 'buff', name: 'Held', target: 'target',
        children: [{ type: 'buffRemover', name: 'End of Held', targetParentBuff: true }],
      }],
    } as any,
  ],
};
const lyra: TestCreature = {
  _id: lyraId, name: 'Lyra', owner: lyraPlayerId, type: 'pc', writers: [gmId],
  props: [hitPoints(lyraHpId, 20000), dexteritySave(2)],
};
// The game master's own character, at the table too
const gmHero: TestCreature = {
  _id: gmHeroId, name: 'Gandalf', owner: gmId, type: 'pc',
  props: [hitPoints(gmHeroHpId, 50)],
};
const goblin: TestCreature = {
  _id: goblinId, name: 'Goblin 1', owner: gmId, type: 'monster',
  props: [
    hitPoints(undefined, 4321),
    {
      _id: breathId, type: 'action', name: 'Fire Breath', target: 'multipleTargets',
      children: [{
        type: 'savingThrow', name: 'Fire Breath', target: 'target', dc: { calculation: '15' }, stat: 'dexteritySave',
        children: [{
          type: 'branch', branchType: 'failedSave',
          children: [{ type: 'damage', target: 'target', damageType: 'fire', amount: { calculation: '2d6' } }],
        }],
      }],
    } as any,
  ],
};
const npc: TestCreature = { _id: npcId, name: 'Innkeeper', owner: gmId, type: 'npc', props: [hitPoints(undefined, 10)] };
// A character of someone outside the table, which the game master put in the folder
const stray: TestCreature = {
  _id: strayId, name: 'Stray', owner: outsiderId, type: 'pc', writers: [gmId], props: [hitPoints(undefined, 10)],
};
// The outsider's own character, in no party
const zed: TestCreature = { _id: zedId, name: 'Zed', owner: outsiderId, type: 'pc', props: [hitPoints(undefined, 10), cure(zedCureId)] };
// Another of Aria's player's characters, which never joined
const ariaToo: TestCreature = {
  _id: ariaTooId, name: 'Aria Too', owner: ariaPlayerId, type: 'pc', props: [hitPoints(undefined, 10), cure(ariaTooCureId)],
};
// A character with the longest name a creature takes
const longName: TestCreature = {
  _id: longId, name: 'L'.repeat(128), owner: outsiderId, type: 'pc', props: [hitPoints(undefined, 10), cure(longCureId)],
};
const ALL = [aria, lyra, gmHero, goblin, npc, stray, zed, ariaToo, longName];

const DENIED = 'targetPicker.errors.denied';
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const latestLog = (creatureId: string) => CreatureLogs.findOneAsync({ creatureId }, { sort: { date: -1 } }) as Promise<any>;
const names = (log: any) => (log?.content || []).map((line: any) => line.name);
const text = (value: unknown) => JSON.stringify(value ?? null);
const damageOf = async (propId: string) => ((await CreatureProperties.findOneAsync(propId)) as any)?.damage || 0;

/** A creature hurt by `damage`, as its sheet reads it */
async function hurt(creatureId: string, propId: string, damage: number) {
  await CreatureProperties.updateAsync(propId, { $set: { damage } }, { selector: { type: 'attribute' } } as any);
  await reloadCachedProperties(creatureId);
  await computeCreature(creatureId);
}

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

const insert = (connection: Connection, creatureId: string, task: object) => call(connection, 'actions.insertAction', {
  action: { creatureId, task, results: [], taskCount: 0 },
});
const run = (connection: Connection, actionId: string) => call(connection, 'actions.runAction', { actionId, decisions: [] });
const propTask = (propId: string, targetIds: string[]) => ({ prop: { _id: propId }, targetIds });

async function setUp() {
  await removeAllCreaturesAndProps();
  await Meteor.users.rawCollection().insertMany([gmId, ariaPlayerId, lyraPlayerId, outsiderId].map((_id, i) => ({
    _id, createdAt: new Date(), username: `party-targeting-${i}-${_id}`,
  })) as any[]);
  for (const creature of ALL) await createTestCreature(creature);
  await CreatureFolders.rawCollection().insertMany([{
    _id: folderId, name: 'The table', owner: gmId, members: [ariaPlayerId, lyraPlayerId],
    creatures: [ariaId, lyraId, goblinId, npcId, gmHeroId, strayId], order: 0,
  }, {
    // An old campaign, archived: Aria's player's other character played there with Lyra
    _id: oldFolderId, name: 'The old table', owner: gmId, members: [ariaPlayerId, lyraPlayerId],
    creatures: [ariaTooId, lyraId], order: 1, archived: true,
  }]);
}

async function tearDown() {
  const ids = ALL.map(creature => creature._id);
  await CreatureLogs.removeAsync({ creatureId: { $in: ids } });
  await EngineActions.removeAsync({ creatureId: { $in: ids } });
  await CreatureFolders.removeAsync({ _id: { $in: [folderId, oldFolderId] } });
  await Meteor.users.removeAsync({ _id: { $in: [gmId, ariaPlayerId, lyraPlayerId, outsiderId] } });
  await removeAllCreaturesAndProps();
}

if (Meteor.isServer) describe('A player targets the other players\' characters of their party', function () {
  this.timeout(60000);
  before(setUp);
  after(tearDown);

  let ariaPlayer: Connection;
  before(async function () {
    ariaPlayer = await openAs(ariaPlayerId);
  });
  after(() => ariaPlayer?.close());

  it('lets Aria heal Lyra: Lyra\'s hit points go up, and her log says Aria healed her', async function () {
    await hurt(lyraId, lyraHpId, 100);
    const lyraPlayer = await openAs(lyraPlayerId);
    try {
      await lyraPlayer.subscribe('singleCharacter', lyraId);
      const actionId = await insert(ariaPlayer, ariaId, propTask(cureId, [lyraId]));
      await run(ariaPlayer, actionId);
      assert.equal(await damageOf(lyraHpId), 93, 'healed by 7');
      const log = await latestLog(lyraId);
      // And what undoes it (phase 2.4, revertReceived.test.ts)
      assert.deepInclude(log.received, { fromCreatureId: ariaId, actionId });
      assert.equal(names(log)[0], 'Aria → you');
      assert.include(text(log.content), '+7 Hit Points', 'her own hit points, whole');
      assert.include(names(log), 'Cure Wounds');
      // In French, as her player reads it: "Aria → vous", then her hit points
      // back (a heal of no dice has no line of its own)
      const french = log.content.map((line: any) => translateLogLine(line, translatorFor('fr')));
      assert.equal(french[0].name, 'Aria → vous');
      assert.deepInclude(french.map(({ name, value }: any) => ({ name, value })),
        { name: 'Barre de vie\u00a0: gain', value: '+7 Hit Points' });
      // Her player receives it
      const received = () => lyraPlayer.messages.find(message => message.collection === 'creatureLogs'
        && message.fields?.received?.fromCreatureId === ariaId);
      for (let i = 0; i < 50 && !received(); i += 1) await pause(100);
      assert.exists(received(), 'the entry reached Lyra\'s player');
    } finally {
      lyraPlayer.close();
    }
  });

  it('lets Aria cast a spell at Lyra, and act on the game master\'s own character', async function () {
    const before = await damageOf(lyraHpId);
    const castActionId = await insert(ariaPlayer, ariaId, {
      subtaskFn: 'castSpell', prop: { _id: castId }, targetIds: [lyraId], params: { withoutSpellSlot: true },
    });
    await run(ariaPlayer, castActionId);
    assert.equal(await damageOf(lyraHpId), before - 4);
    await hurt(gmHeroId, gmHeroHpId, 20);
    const cureActionId = await insert(ariaPlayer, ariaId, propTask(cureId, [gmHeroId]));
    await run(ariaPlayer, cureActionId);
    assert.equal(await damageOf(gmHeroHpId), 13, 'the game master sits at the table');
    assert.equal(names(await latestLog(gmHeroId))[0], 'Aria → you');
  });

  it('lets the browser\'s simulation of insertAction through, which cannot judge the party', async function () {
    // ValidatedMethod throws its stub's exceptions: a refusal there would
    // stop the call before it reached the server
    const actionId = await (insertAction as any)._execute({ userId: ariaPlayerId, isSimulation: true }, {
      action: { creatureId: ariaId, task: propTask(cureId, [lyraId]), results: [], taskCount: 0 },
    });
    assert.isString(actionId);
    await EngineActions.removeAsync(actionId);
  });

  it('refuses a player outside the party, and a character of no current party', async function () {
    const outsider = await openAs(outsiderId);
    try {
      const error = await refusal(insert(outsider, zedId, propTask(zedCureId, [lyraId])));
      assert.equal(error?.error, 'Edit permission denied');
      assert.equal(error?.details?.i18n?.key, DENIED);
      assert.notInclude(text(error), 'Lyra', 'the refusal names no creature');
    } finally {
      outsider.close();
    }
    const error = await refusal(insert(ariaPlayer, ariaTooId, propTask(ariaTooCureId, [lyraId])));
    assert.equal(error?.details?.i18n?.key, DENIED, 'the actor must play in the party too');
    assert.equal(await EngineActions.find({ creatureId: { $in: [zedId, ariaTooId] } }).countAsync(), 0, 'nothing stored');
  });

  it('refuses a check, a rest, an attribute changed, damage typed in or ammunition on Lyra', async function () {
    const tasks = {
      reset: { subtaskFn: 'reset', targetIds: [lyraId], eventName: 'longRest' },
      check: { subtaskFn: 'check', targetIds: [lyraId], abilityVariableName: 'strength', dc: 30 },
      dealDamage: { subtaskFn: 'dealDamage', targetIds: [lyraId], params: { amount: 9999, damageType: 'fire' } },
      damageProp: {
        subtaskFn: 'damageProp', targetIds: [lyraId],
        params: { operation: 'set', value: 0, targetProp: { _id: lyraHpId } },
      },
      consumeItemAsAmmo: {
        subtaskFn: 'consumeItemAsAmmo', targetIds: [lyraId], prop: { _id: ammoActionId },
        params: { value: 1, item: { _id: arrowId } },
      },
    };
    const before = await damageOf(lyraHpId);
    for (const [name, task] of Object.entries(tasks)) {
      const error = await refusal(insert(ariaPlayer, ariaId, task));
      assert.equal(error?.details?.i18n?.key, DENIED, `${name} refused`);
    }
    assert.equal(await damageOf(lyraHpId), before, 'Lyra untouched');
    assert.equal(await EngineActions.find({ creatureId: ariaId }).countAsync(), 0, 'nothing stored');
    // On her own character, the same tasks are hers to send
    assert.isString(await insert(ariaPlayer, ariaId, { ...tasks.reset, targetIds: [ariaId] }));
  });

  it('refuses the game master\'s monsters and non-player characters once the game master turns that off (2.3)', async function () {
    await CreatureFolders.updateAsync(folderId, { $set: { playersTargetMonsters: false } });
    try {
      for (const targetId of [goblinId, npcId]) {
        const error = await refusal(insert(ariaPlayer, ariaId, propTask(cureId, [targetId])));
        assert.equal(error?.details?.i18n?.key, DENIED, targetId === goblinId ? 'the goblin' : 'the innkeeper');
      }
    } finally {
      await CreatureFolders.updateAsync(folderId, { $unset: { playersTargetMonsters: 1 } });
    }
    // On by default (monsterTargeting.test.ts)
    assert.isString(await insert(ariaPlayer, ariaId, propTask(cureId, [goblinId])));
    await EngineActions.removeAsync({ creatureId: ariaId });
  });

  it('refuses the character of someone outside the table, whoever put it in the folder', async function () {
    const error = await refusal(insert(ariaPlayer, ariaId, propTask(cureId, [strayId])));
    assert.equal(error?.details?.i18n?.key, DENIED);
  });

  it('refuses a party that is archived, and takes it once it is not', async function () {
    // Aria's player's other character played with Lyra in the old campaign only
    const error = await refusal(insert(ariaPlayer, ariaTooId, propTask(ariaTooCureId, [lyraId])));
    assert.equal(error?.details?.i18n?.key, DENIED);
    await CreatureFolders.updateAsync(oldFolderId, { $unset: { archived: 1 } });
    try {
      assert.isString(await insert(ariaPlayer, ariaTooId, propTask(ariaTooCureId, [lyraId])));
    } finally {
      await CreatureFolders.updateAsync(oldFolderId, { $set: { archived: true } });
    }
  });

  it('refuses at run a player who left the party once the action was inserted', async function () {
    const before = await damageOf(lyraHpId);
    const actionId = await insert(ariaPlayer, ariaId, propTask(cureId, [lyraId]));
    await call(ariaPlayer, 'creatureFolders.party.leave', { folderId });
    try {
      const error = await refusal(run(ariaPlayer, actionId));
      assert.equal(error?.details?.i18n?.key, DENIED);
      assert.equal(await damageOf(lyraHpId), before, 'Lyra untouched');
      assert.equal(await CreatureLogs.find({ actionId }).countAsync(), 0, 'nothing logged');
    } finally {
      // Back at the table, with Aria
      await CreatureFolders.updateAsync(folderId, { $addToSet: { members: ariaPlayerId, creatures: ariaId } });
      await EngineActions.removeAsync({ creatureId: ariaId });
    }
  });

  it('refuses, on Lyra, an action that sets a value or removes her buffs; a condition that ends itself goes', async function () {
    const FOREIGN_WRITE = 'targetPicker.errors.foreignWrite';
    try {
      for (const [name, propId] of [['a value set', doomId], ['a buff remover', dispelId], ['a buff that sets', curseId]]) {
        const error = await refusal(insert(ariaPlayer, ariaId, propTask(propId, [lyraId])));
        assert.equal(error?.details?.i18n?.key, FOREIGN_WRITE, `${name} refused`);
      }
      assert.isString(await insert(ariaPlayer, ariaId, propTask(holdId, [lyraId])), 'a condition that ends itself');
      assert.isString(await insert(ariaPlayer, ariaId, propTask(doomId, [ariaId])), 'on Aria herself');
      // The game master's monster: dispelled as in play, never set
      assert.isString(await insert(ariaPlayer, ariaId, propTask(dispelId, [goblinId])), 'a dispel on the goblin');
      const error = await refusal(insert(ariaPlayer, ariaId, propTask(doomId, [goblinId])));
      assert.equal(error?.details?.i18n?.key, FOREIGN_WRITE, 'a value set on the goblin');
    } finally {
      await EngineActions.removeAsync({ creatureId: ariaId });
    }
  });

  it('says it in English and French', function () {
    for (const key of [DENIED, 'logs.forTarget', 'logs.buffTooLarge']) {
      assert.isString(get(en, key), key);
      assert.isString(get(fr, key), key);
    }
    // French typography: a no-break space before the colon
    assert.include(get(fr, 'logs.buffTooLarge'), ' :');
  });
});

if (Meteor.isServer) describe('The party\'s rule for targeting (partyLetsTarget)', function () {
  const folder = {
    _id: folderId, owner: gmId, members: [ariaPlayerId, lyraPlayerId],
    creatures: [ariaId, lyraId, goblinId, gmHeroId, strayId],
  };
  const pc = (_id: string, owner: string) => ({ _id, owner, type: 'pc' });
  const ariaPc = pc(ariaId, ariaPlayerId);
  const lyraPc = pc(lyraId, lyraPlayerId);

  it('lets those at the table target its player characters with one of theirs', function () {
    assert.isTrue(partyLetsTarget(folder, ariaPlayerId, ariaPc, lyraPc));
    assert.isTrue(partyLetsTarget(folder, gmId, pc(gmHeroId, gmId), lyraPc), 'the game master too');
    assert.isTrue(partyLetsTarget(folder, ariaPlayerId, ariaPc, pc(gmHeroId, gmId)), 'the game master\'s character');
    assert.isTrue(partyTargetable(folder, ariaPlayerId, lyraPc));
  });

  it('refuses anyone else, anything else, anywhere else', function () {
    assert.isFalse(partyLetsTarget(folder, outsiderId, ariaPc, lyraPc), 'a user not at the table');
    assert.isFalse(partyLetsTarget({ ...folder, archived: true }, ariaPlayerId, ariaPc, lyraPc), 'an archived party');
    assert.isFalse(partyLetsTarget(folder, ariaPlayerId, pc(zedId, ariaPlayerId), lyraPc), 'an actor not in the party');
    assert.isFalse(partyLetsTarget(folder, ariaPlayerId, ariaPc, pc(zedId, lyraPlayerId)), 'a target not in the party');
    assert.isFalse(partyLetsTarget(folder, ariaPlayerId, ariaPc, pc(strayId, outsiderId)), 'a target of someone else\'s');
    assert.isFalse(partyLetsTarget(folder, ariaPlayerId, pc(ariaId, outsiderId), lyraPc), 'an actor of someone else\'s');
    // The game master's monsters and non-player characters once turned off (2.3)
    const off = { ...folder, playersTargetMonsters: false };
    assert.isFalse(partyLetsTarget(off, ariaPlayerId, ariaPc, { _id: goblinId, owner: gmId, type: 'monster' }), 'a monster');
    assert.isFalse(partyLetsTarget(off, ariaPlayerId, ariaPc, { _id: goblinId, owner: gmId, type: 'npc' }), 'an npc');
    assert.isFalse(partyLetsTarget(folder, ariaPlayerId, ariaPc, { _id: lyraId, owner: lyraPlayerId }), 'a creature of no type');
    assert.isFalse(partyTargetable(folder, outsiderId, lyraPc));
    assert.isFalse(partyTargetable(off, ariaPlayerId, { _id: goblinId, owner: gmId, type: 'monster' }));
  });
});

if (Meteor.isServer) describe('An action on several creatures: its actor\'s entry names each', function () {
  this.timeout(30000);
  before(setUp);
  after(tearDown);

  it('names the target of each line about one alone, as a breath on two characters', async function () {
    const action = await runActionById(breathId, [lyraId, ariaId]);
    await writeActionResults(action);
    const log = await latestLog(goblinId);
    const failed = log.content.filter((line: any) => /Failed save|Successful save/.test(line.name));
    assert.sameMembers(failed.map((line: any) => line.name.split(' · ')[0]), ['Lyra', 'Aria'], 'each save names its target');
    for (const line of log.content) {
      if (line.targetIds?.length === 1 && [lyraId, ariaId].includes(line.targetIds[0])) {
        const name = line.targetIds[0] === lyraId ? 'Lyra' : 'Aria';
        assert.match(line.name, new RegExp(`^${name} · `), 'its own target\'s name');
        assert.equal(line.i18n?.name?.key, 'logs.forTarget');
      }
    }
    assert.equal(log.content[0].name, 'Fire Breath', 'a line about both names neither');
    // In French, the saving throw's own message inside
    const french = translateLogLine(failed[0], translatorFor('fr')).name;
    assert.match(french, /^(Lyra|Aria) · Sauvegarde (ratée|réussie)$/);
    // Each target's own entry stays about it alone, and names nobody
    for (const targetId of [lyraId, ariaId]) {
      const own = await latestLog(targetId);
      assert.equal(names(own)[0], 'Goblin 1 → you');
      assert.notInclude(text(names(own)), ' · ');
    }
  });

  it('names nobody when the action had one target', async function () {
    const action = await runActionById(breathId, [lyraId]);
    await writeActionResults(action);
    assert.notInclude(text(names(await latestLog(goblinId))), ' · ');
  });

  it('gives each target of a buff its own line', async function () {
    const action = await runActionById(blessId, [lyraId, gmHeroId]);
    const lines = action.results.flatMap(result => result.mutations.flatMap(mutation => (mutation.contents || [])
      .map(line => ({ name: line.name, targetIds: mutation.targetIds }))));
    assert.deepEqual(lines.filter(line => line.name === 'Bless').map(line => line.targetIds), [[lyraId], [gmHeroId]]);
  });

  it('keeps a wrapped line\'s message reachable: its tone, and the hidden hit points of a monster', function () {
    const crit = { ...logLine({ name: msg('logs.criticalHit') }), targetIds: [lyraId] };
    const hp = { ...logLine({ name: msg('logs.attributeDamaged', { type: 'Health bar' }), value: '−7 Hit Points' }), targetIds: [goblinId] };
    const [namedCrit, namedHp] = namingTargets([crit, hp], [lyraId, goblinId], id => (id === lyraId ? 'Lyra' : 'Goblin 1'));
    assert.equal(namedCrit.name, 'Lyra · Critical hit!');
    assert.equal(logLineTone(namedCrit), 'success');
    assert.equal(namedHp.name, 'Goblin 1 · Health bar damaged');
    assert.deepEqual(withoutHiddenStats([namedCrit, namedHp], [goblinId]), [namedCrit], 'still left out for the players');
  });

  it('keeps a long name to what a log stores', function () {
    const long = 'L'.repeat(128);
    const [line] = namingTargets([{ ...logLine({ name: long }), targetIds: [lyraId] }], [lyraId, ariaId], () => long);
    assert.isAtMost(line.name!.length, 128);
  });

  it('writes the received entry of an actor with the longest name, "→ you" cut to fit', async function () {
    await hurt(lyraId, lyraHpId, 10);
    const action = await runActionById(longCureId, [lyraId]);
    await writeActionResults(action);
    const log = await latestLog(lyraId);
    assert.equal(log?.received?.fromCreatureId, longId);
    assert.lengthOf(log.content[0].name, 128);
    assert.equal(log.content[0].i18n?.name?.params?.name, 'L'.repeat(128), 'the message keeps the whole name');
  });
});

if (Meteor.isServer) describe('A buff copied to another\'s character', function () {
  this.timeout(30000);
  before(setUp);
  after(tearDown);

  const copies = (creatureId: string, name: string) => CreatureProperties.find({
    'root.id': creatureId, type: 'buff', name, removed: { $ne: true },
  }).countAsync();

  it(`holds at most ${MAX_FOREIGN_BUFF_PROPERTIES} properties`, async function () {
    const big = await runActionById(bigBuffId, [lyraId]);
    await writeActionResults(big);
    assert.equal(await copies(lyraId, 'Big Blessing'), 1, `${MAX_FOREIGN_BUFF_PROPERTIES} properties: copied`);
    const huge = await runActionById(hugeBuffId, [lyraId]);
    await writeActionResults(huge);
    assert.equal(await copies(lyraId, 'Huge Blessing'), 0, 'one more: not copied');
    assert.equal(await CreatureProperties.find({ 'root.id': lyraId, name: /^Huge Blessing/ }).countAsync(), 0);
    const line = (await latestLog(ariaId)).content.find((content: any) => content.name === 'Huge Blessing');
    assert.equal(line?.value, `Too large for another's creature: ${MAX_FOREIGN_BUFF_PROPERTIES + 1} properties, ${MAX_FOREIGN_BUFF_PROPERTIES} at most`);
    assert.deepEqual(line?.targetIds, [lyraId]);
    assert.include(text(names(await latestLog(lyraId))), 'Huge Blessing', 'Lyra\'s entry says so too');
  });

  it('copies any size to the actor itself, and to a character of the same owner', async function () {
    const huge = await runActionById(hugeBuffId, [ariaId]);
    await writeActionResults(huge);
    assert.equal(await copies(ariaId, 'Huge Blessing'), 2, 'the original and its copy');
    const toTheOther = await runActionById(hugeBuffId, [ariaTooId]);
    await writeActionResults(toTheOther);
    assert.equal(await copies(ariaTooId, 'Huge Blessing'), 1, 'the same player\'s other character');
  });
});

/*
 * The party's Discord channel gets Aria's heal on Lyra once: Aria's entry.
 * Lyra's own entry goes to her own channel only (phase 2.1's rule, through
 * the methods a player calls)
 */
if (Meteor.isServer) describe('A player healing another: the party\'s Discord channel', function () {
  this.timeout(30000);
  const PARTY = { id: '1100000000000000021', token: 'party-token' };
  const OWN = { id: '1100000000000000022', token: 'own-token' };
  const url = (webhook: { id: string, token: string }) => `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`;
  let fake: FakeDiscord;
  let sender: WebhookSender;
  let previous: WebhookSender | undefined;
  let ariaPlayer: Connection;

  before(async function () {
    await setUp();
    fake = await fakeDiscord();
    sender = createWebhookSender({ baseUrl: fake.baseUrl, onGone: forgetWebhook });
    previous = setWebhookSender(sender);
    await (setPartyWebhook as any)._execute({ userId: gmId }, { folderId, webhook: url(PARTY) });
    await Creatures.updateAsync(lyraId, { $set: { 'settings.discordWebhook': url(OWN) } });
    ariaPlayer = await openAs(ariaPlayerId);
  });

  after(async function () {
    ariaPlayer?.close();
    await discordIntakeIdle();
    await sender.idle();
    setWebhookSender(previous);
    await fake.close();
    await tearDown();
  });

  it('posts the heal once in the party\'s channel, and Lyra\'s entry in her own', async function () {
    await hurt(lyraId, lyraHpId, 50);
    const seen = fake.requests.length;
    const actionId = await insert(ariaPlayer, ariaId, propTask(cureId, [lyraId]));
    await run(ariaPlayer, actionId);
    await discordIntakeIdle();
    await sender.idle();
    const fresh = fake.requests.slice(seen).filter(request => request.method !== 'GET');
    const party = fresh.filter(request => request.webhookId === PARTY.id).map(request => request.body);
    const own = fresh.filter(request => request.webhookId === OWN.id).map(request => request.body);
    assert.lengthOf(party, 1, 'once in the party\'s channel');
    assert.equal(party[0].username, 'Aria', 'Aria\'s entry');
    assert.lengthOf(own, 1, 'Lyra\'s entry in her own channel');
    assert.include(text(own[0]), 'Aria → Lyra');
    assert.include(text(own[0]), '+7 Hit Points');
  });
});
