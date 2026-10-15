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
import { reloadCachedProperties } from '/imports/api/engine/loadCreatures';
import computeCreature from '/imports/api/engine/computeCreature';
import { about, openAs, refusal } from '/imports/api/utility/ddpClient.testFn';
import { revertOf, type ChangedProp } from '/imports/api/creature/log/receivedRevert';
import {
  createWebhookSender, discordIntakeIdle, forgetWebhook, setWebhookSender, type WebhookSender,
} from '/imports/api/creature/log/server/discordWebhooks';
import { setPartyWebhook } from '/imports/api/creature/creatureFolders/methods/discordMethods';
import { fakeDiscord, type FakeDiscord } from '/imports/api/creature/log/server/fakeDiscord.testFn';
import { translateLogLine } from '/imports/api/creature/log/logMessages';
import { translatorFor } from '/imports/api/creature/log/discord/discordMessages';
import en from '/imports/ui/i18n/en.json';
import fr from '/imports/ui/i18n/fr.json';

// Untyped: the folders' schema is JavaScript
const CreatureFolders = CreatureFoldersCollection as any;

let getArchiveObj: (creatureId: string) => Promise<any>;
if (Meteor.isServer) {
  // Unit tests load no entry point: the publications and the methods register here
  /* eslint-disable @typescript-eslint/no-require-imports */
  require('/imports/api/creature/creatureFolders/server/publications/partyBoard');
  require('/imports/api/creature/creatureFolders/server/publications/characterParties');
  require('/imports/api/creature/creatures/server/publications/singleCharacter');
  require('/imports/startup/server/publicationStrategies');
  require('/imports/api/engine/action/methods/index');
  require('/imports/api/creature/creatureFolders/methods/index');
  require('/imports/api/creature/log/methods/revertReceived');
  ({ getArchiveObj } = require('/imports/api/creature/archive/methods/archiveCreatureToFile'));
  /* eslint-enable @typescript-eslint/no-require-imports */
}

/*
 * Phase 2.4 of the monsters: undoing what another creature's action did to a
 * creature, from its received entry ("Goblin 1 → you"). The player's answer
 * to a monster's attack that applied by itself: Shield, Lucky, a resistance
 * forgotten. Its owner and its game master may, while the encounter lasts,
 * once. Through DDP, as a browser calls it.
 */

// The game master, Lyra's player, Aria's player, a player of no party
const [gmId, playerId, otherPlayerId, outsiderId] = getRandomIds(4);
const [folderId] = getRandomIds(1);
const [lyraId, ariaId, goblinId, wolfId] = getRandomIds(4);
const [
  lyraHpId, lyraTempId, lyraStrengthId, blessId, healCountId, clubId, frightId, dispelId, weakenId, petrifyId,
  cureId, biteId, wolfBiteId,
] = getRandomIds(13);

const USERNAMES = [gmId, playerId, otherPlayerId, outsiderId].map((id, i) => `undo-${i}-${id}`.slice(0, 30));
const [gmName, playerName] = USERNAMES;

const DENIED = 'log.undo.errors.denied';

// Lyra: temporary hit points that take damage first, then her hit points; a
// Strength; Bless, a magic effect; a trigger that counts her heals
const lyra: TestCreature = {
  _id: lyraId, name: 'Lyra', owner: playerId, type: 'pc', writers: [gmId],
  props: [
    {
      _id: lyraTempId, type: 'attribute', name: 'Temporary Hit Points', attributeType: 'healthBar', variableName: 'tempHP',
      baseValue: { calculation: '5' }, healthBarDamageOrder: 0, healthBarNoHealing: true,
    } as any,
    {
      _id: lyraHpId, type: 'attribute', name: 'Hit Points', attributeType: 'healthBar', variableName: 'hitPoints',
      baseValue: { calculation: '30' }, healthBarDamageOrder: 1,
    } as any,
    {
      _id: lyraStrengthId, type: 'attribute', attributeType: 'ability', name: 'Strength', variableName: 'strength',
      baseValue: { calculation: '10' },
    } as any,
    { _id: blessId, type: 'buff', name: 'Bless', tags: ['magic'], children: [{ type: 'note', name: 'Bless note' }] } as any,
    {
      _id: healCountId, type: 'attribute', attributeType: 'utility', name: 'Heals', variableName: 'healCount',
      baseValue: { calculation: '100' },
    } as any,
    {
      type: 'trigger', name: 'Heal counter', event: 'damageProperty', timing: 'after', targetTags: ['hitPoints'],
      condition: { calculation: '~healing > 0' },
      children: [{ type: 'adjustment', target: 'self', stat: 'healCount', operation: 'increment', amount: { calculation: '1' } }],
    } as any,
  ],
};

const aria: TestCreature = {
  _id: ariaId, name: 'Aria', owner: otherPlayerId, type: 'pc', writers: [gmId],
  props: [
    { type: 'attribute', name: 'Hit Points', attributeType: 'healthBar', variableName: 'hitPoints', baseValue: { calculation: '20' } } as any,
    {
      _id: cureId, type: 'action', name: 'Cure Wounds', target: 'singleTarget',
      children: [{ type: 'damage', target: 'target', damageType: 'healing', amount: { calculation: '7' } }],
    } as any,
    {
      _id: biteId, type: 'action', name: 'Bite', target: 'singleTarget',
      children: [{ type: 'damage', target: 'target', damageType: 'piercing', amount: { calculation: '4' } }],
    } as any,
  ],
};

// The game master's goblin: its actions apply without a roll
const goblin: TestCreature = {
  _id: goblinId, name: 'Goblin 1', owner: gmId, type: 'monster',
  props: [
    { type: 'attribute', name: 'Hit Points', attributeType: 'healthBar', variableName: 'hitPoints', baseValue: { calculation: '7' } } as any,
    {
      _id: clubId, type: 'action', name: 'Club', target: 'singleTarget',
      children: [{ type: 'damage', target: 'target', damageType: 'bludgeoning', amount: { calculation: '12' } }],
    } as any,
    {
      _id: frightId, type: 'buff', name: 'Frightened', target: 'target', tags: ['condition'],
      children: [{ type: 'note', name: 'Fear' }],
    } as any,
    {
      _id: dispelId, type: 'action', name: 'Dispel', target: 'singleTarget',
      children: [{ type: 'buffRemover', name: 'Dispel Magic', target: 'target', removeAll: true, targetTags: ['magic'] }],
    } as any,
    {
      _id: weakenId, type: 'action', name: 'Weaken', target: 'singleTarget',
      children: [
        { type: 'adjustment', target: 'target', stat: 'strength', operation: 'set', amount: { calculation: '3' } },
        { type: 'damage', target: 'target', damageType: 'necrotic', amount: { calculation: '2' } },
      ],
    } as any,
    {
      _id: petrifyId, type: 'action', name: 'Petrify', target: 'singleTarget',
      children: [{ type: 'adjustment', target: 'target', stat: 'strength', operation: 'set', amount: { calculation: '1' } }],
    } as any,
  ],
};
// Another monster of the game master's, off the board until a step adds it
const wolf: TestCreature = {
  _id: wolfId, name: 'Wolf', owner: gmId, type: 'monster',
  props: [
    { type: 'attribute', name: 'Hit Points', attributeType: 'healthBar', variableName: 'hitPoints', baseValue: { calculation: '11' } } as any,
    {
      _id: wolfBiteId, type: 'action', name: 'Bite', target: 'singleTarget',
      children: [{ type: 'damage', target: 'target', damageType: 'piercing', amount: { calculation: '6' } }],
    } as any,
  ],
};
const ALL = [lyra, aria, goblin, wolf];

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const text = (value: unknown) => JSON.stringify(value ?? null);
const prop = async (propId: string) => await CreatureProperties.findOneAsync(propId) as any;
const damageOf = async (propId: string) => (await prop(propId))?.damage || 0;
const receivedOf = (actionId: string, creatureId = lyraId) =>
  CreatureLogs.findOneAsync({ actionId, creatureId, received: { $exists: true } }) as Promise<any>;
const latestLog = (creatureId: string) => CreatureLogs.findOneAsync({ creatureId }, { sort: { date: -1 } }) as Promise<any>;

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
const undo = (connection: Connection, logId: string) => call(connection, 'creatureLogs.revertReceived', { logId });

/** A creature's attribute's damage set by hand, as its sheet's menu does it */
async function hurt(creatureId: string, propId: string, damage: number) {
  await CreatureProperties.updateAsync(propId, { $set: { damage } }, { selector: { type: 'attribute' } } as any);
  await reloadCachedProperties(creatureId);
  await computeCreature(creatureId);
}

/** Lyra whole again: her temporary hit points and hit points */
async function heal() {
  await hurt(lyraId, lyraTempId, 0);
  await hurt(lyraId, lyraHpId, 0);
}

/** The goblin (or the wolf) acts on Lyra, as its sheet does; its action's id */
async function goblinActs(propId: string, targetId = lyraId): Promise<string> {
  const action = await runActionById(propId, [targetId]);
  await writeActionResults(action);
  return action._id!;
}

async function setUp() {
  await removeAllCreaturesAndProps();
  await Meteor.users.rawCollection().insertMany([gmId, playerId, otherPlayerId, outsiderId].map((_id, i) => ({
    _id, createdAt: new Date(), username: USERNAMES[i],
  })) as any[]);
  for (const creature of ALL) await createTestCreature(creature);
  // A goblin on the board: the party is in an encounter
  await CreatureFolders.rawCollection().insertOne({
    _id: folderId, name: 'The table', owner: gmId, members: [playerId, otherPlayerId],
    creatures: [lyraId, ariaId, goblinId], order: 0,
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

if (Meteor.isServer) describe('Undoing what a creature received: the player\'s answer to a monster', function () {
  this.timeout(120000);
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

  it('keeps what undoes the hit on the entry, server side: temporary hit points first, then hit points', async function () {
    const actionId = await goblinActs(clubId);
    assert.equal(await damageOf(lyraTempId), 5, 'the temporary hit points took 5');
    assert.equal(await damageOf(lyraHpId), 7, 'the hit points the other 7');
    const entry = await receivedOf(actionId);
    assert.deepEqual(entry.received.revert, [
      { op: 'inc', propId: lyraTempId, amount: 5 },
      { op: 'inc', propId: lyraHpId, amount: 7 },
    ]);
    assert.isTrue(entry.received.reversible);
    const folder = await CreatureFolders.findOneAsync(folderId);
    assert.isString(folder.encounterId, 'the party\'s encounter, named');
    assert.deepEqual(entry.received.encounter, { folderId, id: folder.encounterId });
  });

  it('sends the player the entry without what undoes it, and the encounter its sheet compares', async function () {
    const sheet = await openAs(playerId);
    try {
      await sheet.subscribe('singleCharacter', lyraId);
      await sheet.subscribe('characterParties', lyraId);
      const entries = sheet.messages.filter(message => message.collection === 'creatureLogs' && message.fields?.received);
      assert.isNotEmpty(entries);
      for (const entry of entries) {
        assert.notProperty(entry.fields.received, 'revert', 'what undoes it stays on the server');
        assert.isTrue(entry.fields.received.reversible);
        assert.exists(entry.fields.received.encounter);
      }
      assert.notInclude(text(sheet.messages), '"op"');
      const folder = about(sheet.messages, 'creatureFolders', folderId)[0];
      assert.equal(folder?.fields?.encounterId, (await CreatureFolders.findOneAsync(folderId)).encounterId);
      // Nor an archive of the character, which whoever may copy it downloads
      const archive = await getArchiveObj(lyraId);
      assert.notInclude(text(archive.logs), '"revert"');
      assert.include(text(archive.logs), '"reversible"');
    } finally {
      sheet.close();
    }
  });

  it('lets the player undo it: the temporary hit points and the hit points come back, and the entry says who', async function () {
    const healsBefore = await damageOf(healCountId);
    const entry = await latestLog(lyraId);
    const received = (await CreatureLogs.find({ creatureId: lyraId, received: { $exists: true } }, { sort: { date: 1 } })
      .fetchAsync() as any[])[0];
    assert.notEqual(received._id, undefined);
    await undo(player, received._id);
    assert.equal(await damageOf(lyraTempId), 0, 'the temporary hit points back, which no heal gives back');
    assert.equal(await damageOf(lyraHpId), 0, 'the hit points back');
    const undone = (await CreatureLogs.findOneAsync(received._id) as any).received.undone;
    assert.equal(undone.by, playerId);
    assert.equal(undone.name, playerName);
    assert.instanceOf(undone.at, Date);
    // A new entry in her log: who undid it, which entry, what came back
    const told = await latestLog(lyraId);
    assert.notEqual(told._id, entry._id);
    assert.equal(told.content[0].name, `Effect undone by ${playerName}`);
    assert.equal(told.content[0].value, 'Goblin 1 → you');
    assert.include(text(told.content), '+5 Temporary Hit Points');
    assert.include(text(told.content), '+7 Hit Points');
    // In French, as her player reads it
    const french = translateLogLine(told.content[0], translatorFor('fr'));
    assert.equal(french.name, `Effet annulé par ${playerName}`);
    assert.equal(french.value, 'Goblin 1 → vous');
    // Her own damage triggers fired: the hit points came back as a heal
    assert.equal(await damageOf(healCountId), healsBefore + 1, 'her heal counter');
    assert.include(text(told.content), 'Heal counter');
  });

  it('refuses a second undo, and changes nothing', async function () {
    const received = (await CreatureLogs.find({ creatureId: lyraId, 'received.undone': { $exists: true } }).fetchAsync())[0] as any;
    const before = [await damageOf(lyraTempId), await damageOf(lyraHpId)];
    const logs = await CreatureLogs.find({ creatureId: lyraId }).countAsync();
    const error = await refusal(undo(player, received._id));
    assert.equal(error?.error, 'revertReceived.alreadyUndone');
    assert.equal(error?.details?.i18n?.key, 'log.undo.errors.alreadyUndone');
    assert.deepEqual([await damageOf(lyraTempId), await damageOf(lyraHpId)], before);
    assert.equal(await CreatureLogs.find({ creatureId: lyraId }).countAsync(), logs, 'nothing logged');
  });

  it('undoes once when two undo at once, the player and the game master', async function () {
    await heal();
    const actionId = await goblinActs(clubId);
    const entry = await receivedOf(actionId);
    const results = await Promise.allSettled([undo(player, entry._id), undo(gm, entry._id)]);
    assert.lengthOf(results.filter(result => result.status === 'fulfilled'), 1, text(results));
    const refused = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal(refused.reason?.error, 'revertReceived.alreadyUndone');
    assert.equal(await damageOf(lyraTempId), 0);
    assert.equal(await damageOf(lyraHpId), 0, 'healed once, and no further than whole');
    assert.equal(await CreatureLogs.find({ creatureId: lyraId, 'content.0.i18n.name.key': 'logs.undoneBy' }).countAsync(), 2);
  });

  it('takes back this entry\'s changes alone after another hit, or none after a heal: the limits hold', async function () {
    await heal();
    // Hit twice: undoing the first gives back the first's 12 alone
    const first = await goblinActs(clubId);
    const second = await goblinActs(clubId);
    assert.equal(await damageOf(lyraHpId), 7 + 12, 'temporary hit points gone, then 7 and 12');
    await undo(player, (await receivedOf(first))._id);
    assert.equal(await damageOf(lyraTempId), 0, 'the first\'s 5 back to the temporary hit points');
    assert.equal(await damageOf(lyraHpId), 12, 'and its 7: the second hit\'s 12 stay');
    await undo(player, (await receivedOf(second))._id);
    assert.equal(await damageOf(lyraHpId), 0);
    assert.equal(await damageOf(lyraTempId), 0, 'the second never reached them: nothing more');
    // Healed whole by hand since: nothing comes back, no damage below 0
    const third = await goblinActs(clubId);
    await hurt(lyraId, lyraHpId, 0);
    await hurt(lyraId, lyraTempId, 0);
    await undo(player, (await receivedOf(third))._id);
    assert.equal(await damageOf(lyraHpId), 0);
    assert.equal(await damageOf(lyraTempId), 0);
  });

  it('gives back what a character at 0 had left, not the damage rolled', async function () {
    await hurt(lyraId, lyraTempId, 5);
    await hurt(lyraId, lyraHpId, 26);
    const actionId = await goblinActs(clubId);
    assert.equal(await damageOf(lyraHpId), 30, 'down to 0');
    assert.deepEqual((await receivedOf(actionId)).received.revert, [{ op: 'inc', propId: lyraHpId, amount: 4 }]);
    await undo(player, (await receivedOf(actionId))._id);
    assert.equal(await damageOf(lyraHpId), 26, 'her 4 hit points back');
    await heal();
  });

  it('removes a buff the monster put on her, and restores a buff it removed, with what was under it', async function () {
    const frightened = await goblinActs(frightId);
    const copies = () => CreatureProperties.find({ 'root.id': lyraId, name: 'Frightened', removed: { $ne: true } }).fetchAsync();
    const [copy] = await copies() as any[];
    assert.exists(copy, 'Frightened on Lyra');
    const entry = await receivedOf(frightened);
    assert.deepEqual(entry.received.revert, [{ op: 'remove', propId: copy._id }]);
    await undo(player, entry._id);
    assert.isEmpty(await copies(), 'Frightened gone');
    assert.isEmpty(await CreatureProperties.find({ 'root.id': lyraId, name: 'Fear', removed: { $ne: true } }).fetchAsync(),
      'and what was under it');
    assert.include(text((await latestLog(lyraId)).content), 'Frightened');

    const dispelled = await goblinActs(dispelId);
    assert.isTrue((await prop(blessId)).removed, 'Bless removed');
    const dispelEntry = await receivedOf(dispelled);
    assert.deepEqual(dispelEntry.received.revert, [{ op: 'restore', propId: blessId }]);
    await undo(gm, dispelEntry._id);
    assert.notOk((await prop(blessId)).removed, 'Bless back');
    assert.notOk((await CreatureProperties.findOneAsync({ 'root.id': lyraId, name: 'Bless note' }) as any).removed);
    const told = await latestLog(lyraId);
    assert.equal(told.content[0].name, `Effect undone by ${gmName}`, 'the game master, a writer of the party\'s characters');
    assert.deepInclude(told.content.map(({ name, value }: any) => ({ name, value })), { name: 'Restored', value: 'Bless' });
  });

  it('leaves a value set as it is, and says so', async function () {
    await heal();
    const weakened = await goblinActs(weakenId);
    assert.equal((await prop(lyraStrengthId)).value, 3);
    const entry = await receivedOf(weakened);
    assert.deepEqual(entry.received.irreversible, ['Strength']);
    assert.isTrue(entry.received.reversible, 'its damage can be undone');
    await undo(player, entry._id);
    assert.equal((await prop(lyraStrengthId)).value, 3, 'Strength stays set');
    assert.equal(await damageOf(lyraTempId), 0, 'the damage came back');
    const told = await latestLog(lyraId);
    assert.deepInclude(told.content.map(({ name, value }: any) => ({ name, value })),
      { name: 'Not undone (value set)', value: 'Strength' });
    assert.equal(translateLogLine(told.content.find((line: any) => line.value === 'Strength'), translatorFor('fr')).name,
      'Pas d\'annulation (valeur fixée)');
    // A set alone: nothing to undo
    const petrified = await goblinActs(petrifyId);
    const petrifyEntry = await receivedOf(petrified);
    assert.notProperty(petrifyEntry.received, 'reversible');
    assert.deepEqual(petrifyEntry.received.irreversible, ['Strength']);
    const error = await refusal(undo(player, petrifyEntry._id));
    assert.equal(error?.details?.i18n?.key, 'log.undo.errors.nothing');
    assert.notProperty((await CreatureLogs.findOneAsync(petrifyEntry._id) as any).received, 'undone');
    await hurt(lyraId, lyraStrengthId, 0);
  });

  it('refuses another player of the party and a stranger, and says nothing of the entry', async function () {
    await heal();
    const actionId = await goblinActs(clubId);
    const entry = await receivedOf(actionId);
    const other = await openAs(otherPlayerId);
    const outsider = await openAs(outsiderId);
    try {
      for (const connection of [other, outsider]) {
        const error = await refusal(undo(connection, entry._id));
        assert.equal(error?.error, 'revertReceived.denied');
        assert.equal(error?.details?.i18n?.key, DENIED);
        assert.notInclude(text(error), 'Lyra');
        assert.notInclude(text(error), 'Goblin');
      }
      // An id that is no entry: the same refusal
      const unknown = await refusal(undo(other, 'NoSuchLogIdAtAll'));
      assert.equal(unknown?.details?.i18n?.key, DENIED);
    } finally {
      other.close();
      outsider.close();
    }
    assert.notProperty((await CreatureLogs.findOneAsync(entry._id) as any).received, 'undone');
    assert.isAbove(await damageOf(lyraTempId), 0, 'untouched');
    await undo(player, entry._id);
  });

  it('never takes the undo\'s task from a browser', async function () {
    await heal();
    const error = await refusal(call(player, 'actions.insertAction', {
      action: {
        creatureId: lyraId,
        task: { subtaskFn: 'undoReceived', targetIds: [lyraId], params: { changes: [{ propId: lyraHpId, value: -1000 }] } },
        results: [], taskCount: 0,
      },
    }));
    assert.equal(error?.error, 'validation-error');
    assert.equal(await EngineActions.find({ creatureId: lyraId }).countAsync(), 0);
  });

  it('says it in English and French', function () {
    for (const key of [
      'logs.undoneBy', 'logs.someone', 'logs.gmUndid', 'logs.withdrawn', 'logs.restoredEffect', 'logs.notUndone',
      'log.undo.button', 'log.undo.label', 'log.undo.confirm', 'log.undo.confirmHint', 'log.undo.done',
      'log.undo.irreversible', 'log.undo.success', DENIED, 'log.undo.errors.alreadyUndone',
      'log.undo.errors.encounterOver', 'log.undo.errors.nothing',
    ]) {
      assert.isString(get(en, key), key);
      assert.isString(get(fr, key), key);
    }
    // "vous", and a no-break space before a colon
    assert.equal(get(fr, 'log.undo.errors.denied'), 'Vous ne pouvez pas annuler cet effet');
    assert.include(get(fr, 'log.undo.irreversible'), ' :');
    assert.include(get(fr, 'log.undo.errors.encounterOver'), ' :');
  });
});

/*
 * Q5 of the spec: what a creature received can be undone during the
 * encounter it happened in, until the game master ends the combat or the
 * encounter. Out of any encounter, never
 */
if (Meteor.isServer) describe('Undoing what a creature received: while the encounter lasts', function () {
  this.timeout(120000);
  before(setUp);
  after(tearDown);

  let player: Connection;
  let gm: Connection;
  let ariaPlayer: Connection;
  before(async function () {
    player = await openAs(playerId);
    gm = await openAs(gmId);
    ariaPlayer = await openAs(otherPlayerId);
  });
  after(() => {
    player?.close();
    gm?.close();
    ariaPlayer?.close();
  });

  // Aria heals Lyra, through the methods her player calls
  async function ariaHeals(): Promise<any> {
    await hurt(lyraId, lyraHpId, 10);
    const actionId = await call(ariaPlayer, 'actions.insertAction', {
      action: { creatureId: ariaId, task: { prop: { _id: cureId }, targetIds: [lyraId] }, results: [], taskCount: 0 },
    });
    await call(ariaPlayer, 'actions.runAction', { actionId, decisions: [] });
    assert.equal(await damageOf(lyraHpId), 3);
    return receivedOf(actionId);
  }

  it('never undoes what she received out of any encounter: no monster on the board, no fight', async function () {
    await CreatureFolders.updateAsync(folderId, { $pull: { creatures: goblinId } });
    try {
      const entry = await ariaHeals();
      assert.isTrue(entry.received.reversible);
      assert.notProperty(entry.received, 'encounter');
      const error = await refusal(undo(player, entry._id));
      assert.equal(error?.details?.i18n?.key, 'log.undo.errors.encounterOver');
      assert.equal(await damageOf(lyraHpId), 3, 'still healed');
      assert.notProperty(await CreatureFolders.findOneAsync(folderId), 'encounterId');
    } finally {
      await CreatureFolders.updateAsync(folderId, { $addToSet: { creatures: goblinId } });
    }
  });

  it('undoes a heal during a fight with no monster, until the game master ends the combat', async function () {
    await CreatureFolders.updateAsync(folderId, { $pull: { creatures: goblinId } });
    try {
      await call(gm, 'creatureFolders.initiative.roll', { folderId });
      const healed = await ariaHeals();
      assert.exists(healed.received.encounter, 'a fight is an encounter');
      // Undone: Aria's 7 taken back
      await undo(player, healed._id);
      assert.equal(await damageOf(lyraHpId), 10);
      const kept = await ariaHeals();
      await call(gm, 'creatureFolders.initiative.end', { folderId });
      assert.notProperty(await CreatureFolders.findOneAsync(folderId), 'encounterId', 'forgotten');
      const error = await refusal(undo(player, kept._id));
      assert.equal(error?.details?.i18n?.key, 'log.undo.errors.encounterOver');
      assert.equal(await damageOf(lyraHpId), 3);
    } finally {
      await CreatureFolders.updateAsync(folderId, { $addToSet: { creatures: goblinId } });
    }
  });

  it('undoes a monster\'s hit with the monster on the board, until the game master ends the encounter', async function () {
    await heal();
    const before = await goblinActs(clubId);
    const firstEncounter = (await CreatureFolders.findOneAsync(folderId)).encounterId;
    assert.isString(firstEncounter);
    const entry = await receivedOf(before);
    // "End the encounter": the goblin goes, and with it the encounter
    await call(gm, 'creatureFolders.monsters.endEncounter', { folderId, endCombat: true });
    assert.isUndefined(await Creatures.findOneAsync(goblinId), 'the goblin deleted');
    const error = await refusal(undo(player, entry._id));
    assert.equal(error?.details?.i18n?.key, 'log.undo.errors.encounterOver');
    assert.equal(await damageOf(lyraHpId), 7, 'the hit stays');
    // The next encounter is another, the wolf's: what was before stays as it is
    await CreatureFolders.updateAsync(folderId, { $addToSet: { creatures: wolfId } });
    const next = await goblinActs(wolfBiteId);
    assert.equal(await damageOf(lyraHpId), 13);
    const nextEntry = await receivedOf(next);
    assert.notEqual(nextEntry.received.encounter.id, firstEncounter, 'a new encounter');
    assert.equal((await refusal(undo(player, entry._id)))?.details?.i18n?.key, 'log.undo.errors.encounterOver');
    await undo(player, nextEntry._id);
    assert.equal(await damageOf(lyraHpId), 7, 'the new one undone, the old one not');
  });

  it('forgets an encounter whose monsters were deleted from their sheets once a creature acts out of any', async function () {
    // The wolf on the board since the step before
    const actionId = await goblinActs(wolfBiteId);
    const entry = await receivedOf(actionId);
    assert.exists(entry.received.encounter);
    // Off the board by hand, no fight: the next action out of any encounter forgets it
    await CreatureFolders.updateAsync(folderId, { $pull: { creatures: wolfId } });
    await ariaHeals();
    assert.notProperty(await CreatureFolders.findOneAsync(folderId), 'encounterId');
    const error = await refusal(undo(player, entry._id));
    assert.equal(error?.details?.i18n?.key, 'log.undo.errors.encounterOver');
  });
});

/*
 * The undo's entry posts where the creature's entries post, once per
 * channel: the party's and the character's own. The game master undoing a
 * player's hit on a monster posts nothing the players read
 */
if (Meteor.isServer) describe('Undoing what a creature received: Discord', function () {
  this.timeout(60000);
  const PARTY = { id: '1100000000000000041', token: 'party-token' };
  const OWN = { id: '1100000000000000042', token: 'own-token' };
  const url = (webhook: { id: string, token: string }) => `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`;
  let fake: FakeDiscord;
  let sender: WebhookSender;
  let previous: WebhookSender | undefined;
  let player: Connection;
  let gm: Connection;

  before(async function () {
    await setUp();
    fake = await fakeDiscord();
    sender = createWebhookSender({ baseUrl: fake.baseUrl, onGone: forgetWebhook });
    previous = setWebhookSender(sender);
    await (setPartyWebhook as any)._execute({ userId: gmId }, { folderId, webhook: url(PARTY) });
    await Creatures.updateAsync(lyraId, { $set: { 'settings.discordWebhook': url(OWN) } });
    player = await openAs(playerId);
    gm = await openAs(gmId);
  });

  after(async function () {
    player?.close();
    gm?.close();
    await discordIntakeIdle();
    await sender.idle();
    setWebhookSender(previous);
    await fake.close();
    await tearDown();
  });

  async function posted(since: number) {
    await discordIntakeIdle();
    await sender.idle();
    const fresh = fake.requests.slice(since).filter(request => request.method !== 'GET');
    return {
      party: fresh.filter(request => request.webhookId === PARTY.id).map(request => request.body),
      own: fresh.filter(request => request.webhookId === OWN.id).map(request => request.body),
    };
  }

  it('posts the undo once in the party\'s channel and once in the character\'s own', async function () {
    const actionId = await goblinActs(clubId);
    await posted(0);
    const seen = fake.requests.length;
    await undo(player, (await receivedOf(actionId))._id);
    const { party, own } = await posted(seen);
    assert.lengthOf(party, 1, text(party));
    assert.lengthOf(own, 1);
    for (const body of [party[0], own[0]]) {
      assert.equal(body.username, 'Lyra');
      assert.include(text(body), `Effect undone by ${playerName}`);
      assert.include(text(body), 'Goblin 1 → Lyra', 'the channel\'s readers are the table');
    }
  });

  it('posts one neutral line, the actor\'s, when the game master undoes a hit on their monster', async function () {
    // Aria's bite on the goblin, which its game master undoes
    const ariaPlayer = await openAs(otherPlayerId);
    try {
      const actionId = await call(ariaPlayer, 'actions.insertAction', {
        action: { creatureId: ariaId, task: { prop: { _id: biteId }, targetIds: [goblinId] }, results: [], taskCount: 0 },
      });
      await call(ariaPlayer, 'actions.runAction', { actionId, decisions: [] });
      const entry = await receivedOf(actionId, goblinId);
      assert.isTrue(entry.received.reversible);
      await posted(0);
      const seen = fake.requests.length;
      await undo(gm, entry._id);
      const { party, own } = await posted(seen);
      // Once in the party's channel, under Aria: the action and the monster, nothing else
      assert.lengthOf(party, 1, text(party));
      assert.equal(party[0].username, 'Aria');
      assert.include(text(party[0]), 'The GM undid: Bite → Goblin 1');
      for (const leak of ['Hit Points', '+4', '−4', 'Effect undone', 'logs.']) assert.notInclude(text(party[0]), leak);
      assert.isEmpty(own, 'Lyra\'s own channel: not hers');
      // In Aria's log, that line alone
      const told = await latestLog(ariaId);
      assert.deepEqual(told.content.map(({ name, value }: any) => ({ name, value })),
        [{ name: 'The GM undid: Bite → Goblin 1', value: undefined }]);
      assert.equal((await latestLog(goblinId)).content[0].name, `Effect undone by ${gmName}`, 'the monster\'s log, the game master\'s');
      assert.include(text((await latestLog(goblinId)).content), '+4 Hit Points', 'whole there');
    } finally {
      ariaPlayer.close();
    }
  });
});

describe('What undoes a received entry (revertOf)', function () {
  const target = 'target';
  const changed = new Map<string, ChangedProp>([
    ['hp', { rootId: target, title: 'Hit Points' }],
    ['temp', { rootId: target, title: 'Temporary Hit Points' }],
    ['str', { rootId: target, title: 'Strength' }],
    ['uses', { rootId: target, title: 'Arrows' }],
    ['bless', { rootId: target, title: 'Bless' }],
    ['actorsBuff', { rootId: 'actor', title: 'Rage' }],
    ['othersHp', { rootId: 'other', title: 'Hit Points' }],
  ]);
  const damage = (propId: string, amount: number) => ({ propId, type: 'attribute', inc: { damage: amount, value: -amount } });

  it('adds the damage of each attribute up, and takes the creature\'s own properties alone', function () {
    const { revert, irreversible } = revertOf(target, [
      { targetIds: [target], updates: [damage('temp', 5), damage('hp', 7)] },
      { targetIds: [target], updates: [damage('hp', 3), damage('othersHp', 9)] },
      { targetIds: [target], updates: [damage('temp', -5), damage('temp', 5)] },
    ], changed, new Set());
    assert.deepEqual(revert, [
      { op: 'inc', propId: 'temp', amount: 5 },
      { op: 'inc', propId: 'hp', amount: 10 },
    ]);
    assert.isEmpty(irreversible);
  });

  it('names what was set, or changed otherwise, as not undone', function () {
    const { revert, irreversible } = revertOf(target, [
      { targetIds: [target], updates: [{ propId: 'str', type: 'attribute', set: { damage: 7, value: 3 } }] },
      { targetIds: [target], updates: [{ propId: 'uses', type: 'item', inc: { quantity: -1 } }] },
      { targetIds: [target], updates: [{ propId: 'str', type: 'attribute', set: { damage: 9, value: 1 } }] },
    ], changed, new Set());
    assert.isEmpty(revert);
    assert.deepEqual(irreversible, ['Strength', 'Arrows']);
  });

  it('removes the tops of what was put on, restores what was removed, not the actor\'s own', function () {
    const { revert } = revertOf(target, [
      {
        targetIds: [target],
        inserts: [
          { _id: 'hex', parentId: undefined, root: { id: target } },
          { _id: 'hexNote', parentId: 'hex', root: { id: target } },
          { _id: 'othersHex', root: { id: 'other' } },
        ] as any,
      },
      // A remover of the actor's parent buff, under the target's name
      { targetIds: [target], removals: [{ propId: 'actorsBuff' }, { propId: 'bless' }] },
      // Already gone before the action: nothing to restore
      { targetIds: [target], removals: [{ propId: 'gone' }] },
    ], changed, new Set(['actorsBuff', 'bless']));
    assert.deepEqual(revert, [
      { op: 'remove', propId: 'hex' },
      { op: 'restore', propId: 'bless' },
    ]);
  });
});
