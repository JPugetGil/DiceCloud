#!/usr/bin/env node
/**
 * A condition a monster of the bestiary imposes, which its target repeats
 * at the end of each of its turns (phase 3.6). The test account makes a
 * board that the other test account joins with its character, given a
 * Constitution save at -100, and adds a ghoul of the SRD 5.1 bestiary. The
 * ghoul's Claws save fails: the character is paralyzed (and incapacitated),
 * its chip on the board. The fight starts with the character: its turn ends,
 * the save it repeats fails, the condition stays. Its save set to +100, its
 * next turn ends: the save succeeds and the condition goes, which its log
 * says and its player reads. Everything is put back at the end.
 */
const { openPage, visit } = require('../lib/browser');
const { withDb } = require('../lib/db');
const { USERNAME } = require('../lib/config');
const { createChecker, main } = require('../lib/check');

const OTHER = `${USERNAME}-other`;
const BESTIARY = 'SRD 5.1 Bestiary';
// The rate limits refuse faster calls without a word
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Calls a method as the page's user, through the app */
function caller(page) {
  return async (name, args) => {
    const result = await page.evaluate(({ name, args }) => window.Meteor.callAsync(name, args)
      .then(value => ({ value }), e => ({ error: e.reason || e.message })), { name, args });
    await pause(1200);
    if (result.error) throw new Error(`${name}: ${result.error}`);
    return result.value;
  };
}

const removeOverlay = page => page.evaluate(() => document.querySelector('#rspack-dev-server-client-overlay')?.remove());

/** The character's live buff of that name, if any */
const buffNamed = (characterId, name) => withDb(db => db.collection('creatureProperties').findOne({
  'root.id': characterId, type: 'buff', name, removed: { $ne: true },
}));
/** A creature's log entries written since `since`, oldest first: their shown lines' names and values */
const entries = (creatureId, since) => withDb(async db => (await db.collection('creatureLogs')
  .find({ creatureId, date: { $gte: since } }, { sort: { date: 1 } }).toArray())
  .map(log => (log.content || []).filter(line => !line.silenced).map(line => `${line.name}: ${line.value || ''}`)));

async function waitFor(check, what, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await pause(250);
  }
}

main(async () => {
  const data = await withDb(async db => {
    const gm = await db.collection('users').findOne({ username: USERNAME }, { projection: { subscribedLibraries: 1 } });
    const player = await db.collection('users').findOne({ username: OTHER }, { projection: { _id: 1 } });
    const bestiary = await db.collection('libraries').findOne({ name: BESTIARY }, { projection: { _id: 1 } });
    const ghoul = bestiary && await db.collection('libraryNodes').findOne(
      { 'root.id': bestiary._id, type: 'creature', name: 'Ghoul', removed: { $ne: true } }, { projection: { _id: 1 } },
    );
    const character = player && await db.collection('creatures').findOne(
      { owner: player._id, type: 'pc' }, { projection: { _id: 1, name: 1 } },
    );
    return { gm, player, bestiary, ghoul, character };
  });
  const { step, finish } = createChecker('Conditions ended by a repeated saving throw');
  if (!data.bestiary || !data.ghoul) {
    await step(`the "${BESTIARY}" library is in the database`, null, () => {
      throw new Error('import it first (tools/libraryImport)');
    });
    return finish();
  }
  if (!data.player || !data.character) {
    await step(`${OTHER} has a character`, null, () => {
      throw new Error('run "npm run setup" first');
    });
    return finish();
  }
  const alreadyFollowed = (data.gm.subscribedLibraries || []).includes(data.bestiary._id);
  const characterId = data.character._id;

  const gm = await openPage();
  const call = caller(gm.page);
  const browsers = [gm.browser];
  let folderId;
  let ghoulId;
  const added = [];
  let saveBonusId;
  let since;
  const tracker = () => withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId })).initiative);
  try {
    await step('a board with a player\'s character, its Constitution save at -100, and a ghoul of the bestiary', gm.messages, async () => {
      await visit(gm.page, '/character-list', 3000);
      if (!alreadyFollowed) await call('users.subscribeToLibrary', { libraryId: data.bestiary._id, subscribe: true });
      folderId = await call('creatureFolders.methods.insert', {});
      await call('creatureFolders.methods.updateName', { _id: folderId, name: 'E2E repeated saves' });
      const token = await call('creatureFolders.party.createInvite', { folderId });
      const player = await openPage({ username: OTHER });
      browsers.push(player.browser);
      await visit(player.page, '/character-list', 3000);
      await caller(player.page)('creatureFolders.party.join', { token, creatureIds: [characterId] });
      await player.browser.close();
      // The game master edits the character since it joined
      const parentRef = { collection: 'creatures', id: characterId };
      added.push(await call('creatureProperties.insert', {
        creatureProperty: { type: 'skill', name: 'E2E Constitution Save', skillType: 'save', variableName: 'constitutionSave' },
        parentRef,
      }));
      saveBonusId = await call('creatureProperties.insert', {
        creatureProperty: {
          type: 'effect', name: 'E2E save bonus', operation: 'add', amount: { calculation: '-100' }, stats: ['constitutionSave'],
        },
        parentRef,
      });
      added.push(saveBonusId);
      await call('creatureFolders.monsters.add', { folderId, nodeId: data.ghoul._id, count: 1 });
      ghoulId = await withDb(async db => {
        const ids = (await db.collection('creatureFolders').findOne({ _id: folderId })).creatures;
        return ids.find(id => id !== characterId);
      });
      if (!ghoulId) throw new Error('no ghoul on the board');
      // The server computes the creatures someone has open: the board loads its members
      await visit(gm.page, `/party/${folderId}`, 3000);
      await removeOverlay(gm.page);
      await waitFor(() => withDb(async db => (await db.collection('creatureProperties').findOne({ _id: added[0] }))
        ?.value === -100), 'the character\'s Constitution save to be computed at -100');
    });

    await step('the ghoul\'s Claws save fails: the character is paralyzed and incapacitated, its chip on the board', gm.messages, async () => {
      const claws = await withDb(db => db.collection('creatureProperties').findOne({
        'root.id': ghoulId, type: 'savingThrow', name: 'Claws', target: 'target', removed: { $ne: true },
      }));
      if (!claws) throw new Error('the ghoul has no Claws saving throw');
      const actionId = await call('actions.insertAction', {
        action: { creatureId: ghoulId, task: { prop: { _id: claws._id }, targetIds: [characterId] }, results: [], taskCount: 0 },
      });
      await call('actions.runAction', { actionId, decisions: [] });
      const paralyzed = await waitFor(() => buffNamed(characterId, 'Paralyzed'), 'the character to be paralyzed');
      if (!await buffNamed(characterId, 'Incapacitated')) throw new Error('not incapacitated');
      if (paralyzed.duration?.calculation !== '10') throw new Error(`lasts ${JSON.stringify(paralyzed.duration)}`);
      await gm.page.waitForSelector(`[data-id="party-condition-${paralyzed._id}"]`, { timeout: 10000 });
      return 'Paralyzed, 10 rounds';
    });

    await step('the character\'s turn ends: the save it repeats fails, the condition stays', gm.messages, async () => {
      await call('creatureFolders.initiative.addCreatures', { folderId, creatureIds: [characterId, ghoulId] });
      for (const entry of (await tracker()).entries) {
        await call('creatureFolders.initiative.update', {
          folderId, entryId: entry._id, initiative: entry.creatureId === characterId ? 20 : 10,
        });
      }
      // The fight starts with the character's turn; then it ends
      await call('creatureFolders.initiative.advance', { folderId, step: 1 });
      since = new Date();
      await call('creatureFolders.initiative.advance', { folderId, step: 1 });
      const lines = await waitFor(async () => (await entries(characterId, since)).flat().find(line => line.startsWith('Claws')) && (await entries(characterId, since)).flat(),
        'the repeated save in the character\'s log');
      if (!await buffNamed(characterId, 'Paralyzed')) throw new Error('the condition ended on a failed save');
      return lines.filter(line => line.startsWith('Claws')).join(' · ');
    });

    await step('its save set to +100, its next turn ends: the save succeeds, the condition goes', gm.messages, async () => {
      await call('creatureProperties.update', { _id: saveBonusId, path: ['amount', 'calculation'], value: '100' });
      // The ghoul's turn ends, the character's starts; then the character's ends
      since = new Date();
      await call('creatureFolders.initiative.advance', { folderId, step: 1 });
      await call('creatureFolders.initiative.advance', { folderId, step: 1 });
      await waitFor(async () => !await buffNamed(characterId, 'Paralyzed'), 'the condition to end');
      if (await buffNamed(characterId, 'Incapacitated')) throw new Error('still incapacitated');
      const lines = (await entries(characterId, since)).flat();
      if (!lines.some(line => line.startsWith('Claws'))) throw new Error(`the character's lines: ${JSON.stringify(lines)}`);
      return lines.filter(line => /^(Claws|Removed)/.test(line)).join(' · ');
    });

    await step(`${OTHER} reads the repeated save and the end of the condition in their character's log`, null, async () => {
      const player = await openPage({ username: OTHER });
      browsers.push(player.browser);
      await visit(player.page, `/character/${characterId}`, 6000);
      await removeOverlay(player.page);
      const log = await player.page.evaluate(() => document.querySelector('.character-log')?.innerText || '');
      if (!log.includes('Claws') || !log.includes('Paralyzed')) {
        throw new Error(`the character's log reads "${log.replace(/\s+/g, ' ').slice(0, 300)}"`);
      }
      await player.browser.close();
      if (player.messages.length) throw new Error(player.messages[0]);
    });
  } finally {
    // Put everything back, through the app
    try {
      for (const name of ['Paralyzed', 'Incapacitated']) {
        const left = await buffNamed(characterId, name);
        if (left) await call('creatureProperties.softRemove', { _id: left._id });
      }
      for (const id of added) await call('creatureProperties.softRemove', { _id: id });
      if (ghoulId) await call('creatureFolders.monsters.endEncounter', { folderId, endCombat: true });
      if (folderId) {
        const player = await openPage({ username: OTHER });
        browsers.push(player.browser);
        await visit(player.page, '/character-list', 2000);
        await caller(player.page)('creatureFolders.party.leave', { folderId });
        await call('creatureFolders.methods.remove', { _id: folderId });
      }
      if (!alreadyFollowed) await call('users.subscribeToLibrary', { libraryId: data.bestiary._id, subscribe: false });
    } finally {
      for (const browser of browsers) await browser.close().catch(() => {});
    }
  }
  finish();
});
