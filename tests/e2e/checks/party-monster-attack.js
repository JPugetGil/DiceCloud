#!/usr/bin/env node
/**
 * A player's character attacks the game master's monster (phase 2.3): the
 * test account makes a board that the other test account joins with its
 * character, and adds a goblin of the SRD 5.1 bestiary, given distinctive
 * hit points, armor class and Dexterity save, and a hidden effect. The
 * player's attack ("Target…") offers the goblin; picked, the action's dialog
 * says "result at resolution" before the server rolls, and the character's
 * log says "Hit!" and the damage dealt, nothing of the goblin's hit points
 * or armor class. A saving throw says "<goblin> · Failed save", without the
 * goblin's roll. The game master reads everything in the goblin's own log.
 * No frame the player's browser receives holds the goblin's numbers. Then the
 * game master turns "Players target the monsters" off on the board: the
 * goblin leaves the player's picker and its card's "Target", and the server
 * refuses it. Everything is put back.
 */
const { openPage, visit } = require('../lib/browser');
const { withDb } = require('../lib/db');
const { USERNAME } = require('../lib/config');
const { createChecker, main } = require('../lib/check');

const OTHER = `${USERNAME}-other`;
const BESTIARY = 'SRD 5.1 Bestiary';
const DENIED = 'You may not target this creature with this action';
const SEAL = 'E2E SECRET SEAL';
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

/** The reason a method call is refused with, or null when it is not */
const refusalOf = (page, name, args) => page.evaluate(({ name, args }) => window.Meteor.callAsync(name, args)
  .then(() => null, e => e.reason || e.message), { name, args });

/** Every DDP frame the page receives from now on */
function recordFrames(page) {
  const frames = [];
  page.on('websocket', socket => socket.on('framereceived', ({ payload }) => frames.push(String(payload))));
  return frames;
}

const removeOverlay = page => page.evaluate(() => document.querySelector('#rspack-dev-server-client-overlay')?.remove());
const dialogs = page => page.locator('.dialog-stack .dialog-component');
const popDialog = page => page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s
  .get('dialogStack').popDialogStack());
const showTab = (page, creatureId, tab) => page.evaluate(({ creatureId, tab }) => document.querySelector('#app')
  .__vue_app__.config.globalProperties.$pinia._s.get('app').setTabForCharacterSheet({ id: creatureId, tab }), { creatureId, tab });

async function waitFor(condition, what, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await condition();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await pause(250);
  }
}

const prop = (query, projection = {}) => withDb(db => db.collection('creatureProperties').findOne(
  { removed: { $ne: true }, ...query }, { projection },
));
// The character's entry of an action of its own, once written
const ownEntry = (creatureId, name, after) => withDb(db => db.collection('creatureLogs').findOne(
  { creatureId, 'content.0.name': name, received: { $exists: false }, ...after && { date: { $gt: after } } },
  { sort: { date: -1 } },
));
const receivedEntry = (creatureId, fromCreatureId, after) => withDb(db => db.collection('creatureLogs').findOne(
  { creatureId, 'received.fromCreatureId': fromCreatureId, ...after && { date: { $gt: after } } }, { sort: { date: -1 } },
));

main(async () => {
  const data = await withDb(async db => {
    const gm = await db.collection('users').findOne({ username: USERNAME }, { projection: { subscribedLibraries: 1 } });
    const player = await db.collection('users').findOne({ username: OTHER }, { projection: { _id: 1 } });
    const bestiary = await db.collection('libraries').findOne({ name: BESTIARY }, { projection: { _id: 1 } });
    const goblin = bestiary && await db.collection('libraryNodes').findOne(
      { 'root.id': bestiary._id, type: 'creature', name: 'Goblin', removed: { $ne: true } }, { projection: { _id: 1 } },
    );
    const character = player && await db.collection('creatures').findOne(
      { owner: player._id, type: 'pc' }, { projection: { _id: 1, name: 1 } },
    );
    return { gm, player, bestiary, goblin, character };
  });
  const { step, finish } = createChecker('Players target the monsters: a player\'s character attacks the game master\'s goblin');
  if (!data.bestiary || !data.goblin) {
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
  let player;
  let callAsPlayer;
  let frames = [];
  let folderId;
  let goblinId;
  let goblinName;
  let lungeId;
  let flameId;
  // The goblin's numbers, which no player may read: read off the database
  // once computed
  const secrets = [SEAL];
  const playerPropIds = [];
  try {
    await step('a board with the player\'s character and a goblin with distinctive numbers', gm.messages, async () => {
      await visit(gm.page, '/character-list', 3000);
      if (!alreadyFollowed) await call('users.subscribeToLibrary', { libraryId: data.bestiary._id, subscribe: true });
      folderId = await call('creatureFolders.methods.insert', {});
      await call('creatureFolders.methods.updateName', { _id: folderId, name: 'E2E monster attack' });
      const token = await call('creatureFolders.party.createInvite', { folderId });
      player = await openPage({ username: OTHER });
      browsers.push(player.browser);
      callAsPlayer = caller(player.page);
      await visit(player.page, '/character-list', 3000);
      await callAsPlayer('creatureFolders.party.join', { token, creatureIds: [characterId] });
      await call('creatureFolders.monsters.add', { folderId, nodeId: data.goblin._id, count: 1 });
      goblinId = await withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId })).creatures
        .find(id => id !== characterId));
      if (!goblinId) throw new Error('no goblin on the board');
      goblinName = (await withDb(db => db.collection('creatures').findOne({ _id: goblinId }, { projection: { name: 1 } }))).name;
      // Numbers no player could guess: its hit points, its armor class, a
      // Dexterity save it always fails, and an effect that is no condition
      const hitPoints = await prop({ 'root.id': goblinId, variableName: 'hitPoints', attributeType: 'healthBar' });
      const armor = await prop({ 'root.id': goblinId, variableName: 'armor', type: 'attribute' });
      if (!hitPoints || !armor) throw new Error('the goblin has no hitPoints or armor attribute');
      await call('creatureProperties.update', { _id: hitPoints._id, path: ['baseValue', 'calculation'], value: '31415' });
      await call('creatureProperties.update', { _id: armor._id, path: ['baseValue', 'calculation'], value: '27182' });
      await call('creatureProperties.insert', {
        creatureProperty: {
          type: 'effect', name: 'E2E Clumsy', operation: 'add', amount: { calculation: '-16180' }, stats: ['dexteritySave'],
        },
        parentRef: { collection: 'creatures', id: goblinId },
      });
      await call('creatureProperties.insert', {
        creatureProperty: { type: 'buff', name: SEAL, tags: ['magic'] },
        parentRef: { collection: 'creatures', id: goblinId },
      });
      // The server computes the creatures someone has open: its sheet
      await visit(gm.page, `/character/${goblinId}`, 4000);
      const computed = await waitFor(async () => {
        const [hp, ac, save] = await Promise.all([
          prop({ _id: hitPoints._id }, { total: 1 }),
          prop({ _id: armor._id }, { total: 1, value: 1 }),
          prop({ 'root.id': goblinId, variableName: 'dexteritySave' }, { value: 1 }),
        ]);
        return hp?.total >= 31415 && ac?.value >= 27182 && save?.value <= -16000 && { hp: hp.total, ac: ac.value, save: save.value };
      }, 'the goblin computed', 20000);
      secrets.push(String(computed.hp), String(computed.ac), String(Math.abs(computed.save)));
      // The player's character: an attack that hits that armor class, and a
      // saving throw the goblin fails
      lungeId = await callAsPlayer('creatureProperties.insert', {
        creatureProperty: { type: 'action', name: 'E2E Lunge', target: 'singleTarget', attackRoll: { calculation: '30000' } },
        parentRef: { collection: 'creatures', id: characterId },
      });
      playerPropIds.push(lungeId);
      const hit = await callAsPlayer('creatureProperties.insert', {
        creatureProperty: { type: 'branch', branchType: 'hit' },
        parentRef: { collection: 'creatureProperties', id: lungeId },
      });
      await callAsPlayer('creatureProperties.insert', {
        creatureProperty: { type: 'damage', target: 'target', damageType: 'slashing', amount: { calculation: '7' } },
        parentRef: { collection: 'creatureProperties', id: hit },
      });
      flameId = await callAsPlayer('creatureProperties.insert', {
        creatureProperty: { type: 'action', name: 'E2E Flame', target: 'singleTarget' },
        parentRef: { collection: 'creatures', id: characterId },
      });
      playerPropIds.push(flameId);
      const save = await callAsPlayer('creatureProperties.insert', {
        creatureProperty: {
          type: 'savingThrow', name: 'E2E Flame', target: 'target', dc: { calculation: '15' }, stat: 'dexteritySave',
        },
        parentRef: { collection: 'creatureProperties', id: flameId },
      });
      const failed = await callAsPlayer('creatureProperties.insert', {
        creatureProperty: { type: 'branch', branchType: 'failedSave' },
        parentRef: { collection: 'creatureProperties', id: save },
      });
      await callAsPlayer('creatureProperties.insert', {
        creatureProperty: { type: 'damage', target: 'target', damageType: 'radiant', amount: { calculation: '3' } },
        parentRef: { collection: 'creatureProperties', id: failed },
      });
      return `${goblinName}: ${computed.hp} hit points, armor class ${computed.ac}, Dexterity save ${computed.save}`;
    });

    await step('the player\'s "Target…" offers the goblin; the dialog says "result at resolution"; the log, "Hit!" and the damage dealt', player.messages, async () => {
      // Every frame from the sheet's load on
      frames = recordFrames(player.page);
      await visit(player.page, `/character/${characterId}`, 5000);
      await removeOverlay(player.page);
      await showTab(player.page, characterId, 'actions');
      await player.page.waitForTimeout(1500);
      // A natural 1 misses whatever the bonus: then the player attacks again
      let log;
      let previews = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await player.page.locator(`[data-id="${lungeId}-target-button"]`).first().click();
        await player.page.waitForSelector(`[data-id="target-option-${goblinId}"]`, { timeout: 15000 });
        await player.page.waitForTimeout(500);
        await player.page.locator(`[data-id="target-option-${goblinId}"] input`).check();
        const started = new Date();
        await player.page.locator('[data-id="target-picker-confirm"]').click();
        // The attack's advantage, in the action's dialog that took the picker's place
        await player.page.waitForSelector('.dialog-stack .action-dialog', { timeout: 15000 });
        await player.page.waitForTimeout(1500);
        await player.page.locator('.dialog-stack #roll-hex').first().click();
        await player.page.waitForTimeout(2000);
        const preview = await player.page.evaluate(() => document.querySelector('.dialog-stack .log-preview')?.innerText || '');
        if (!/result at resolution/.test(preview) || /Hit!|Miss!|armor/.test(preview)) {
          throw new Error(`the action's preview: ${JSON.stringify(preview.replace(/\s+/g, ' ').slice(0, 200))}`);
        }
        previews.push(preview.replace(/\s+/g, ' ').trim());
        await player.page.locator('.dialog-stack .done-button').first().click({ timeout: 15000 });
        log = await waitFor(() => ownEntry(characterId, 'E2E Lunge', started), 'the character\'s entry');
        await waitFor(async () => !await dialogs(player.page).count(), 'the dialogs to close');
        if (!log.content.some(line => line.name === 'Critical miss!')) break;
      }
      const names = log.content.map(line => line.name);
      if (!names.includes('Hit!') && !names.includes('Critical hit!')) throw new Error(`its lines: ${names.join(' · ')}`);
      const damage = log.content.find(line => line.name === 'Damage');
      if (!/\*\*7\*\* (critical )?slashing damage/.test(damage?.value || '')) {
        throw new Error(`the damage's line: ${JSON.stringify(damage)}`);
      }
      const text = JSON.stringify(log.content);
      const leaked = [...secrets, 'Hit Points', 'logs.attributeDamaged'].filter(secret => text.includes(secret));
      if (leaked.length) throw new Error(`the goblin's numbers in the character's log: ${leaked.join(', ')}`);
      return `${previews.at(-1)} → ${names.join(' · ')}`;
    });

    await step('the game master reads everything in the goblin\'s own log', gm.messages, async () => {
      const log = await waitFor(() => receivedEntry(goblinId, characterId), 'the goblin\'s entry');
      const text = JSON.stringify(log.content);
      if (!/"(Hit!|Critical hit!)"/.test(text) || !/−7 Hit Points/.test(text)) throw new Error(`the goblin's entry: ${text.slice(0, 300)}`);
      if (!/1d20 \[\d+\] \+ 30000/.test(text)) throw new Error('the attack\'s roll, whole for the game master');
      await visit(gm.page, `/character/${goblinId}`, 5000);
      await removeOverlay(gm.page);
      const shown = await waitFor(async () => {
        const logText = await gm.page.evaluate(() => document.querySelector('.character-log')?.innerText || '');
        return logText.includes(`${data.character.name} → you`) && logText;
      }, 'the entry on the goblin\'s sheet', 10000);
      if (!/Hit Points/.test(shown)) throw new Error(`the goblin's log reads "${shown.replace(/\s+/g, ' ').slice(0, 200)}"`);
    });

    await step('a saving throw: the player reads "<goblin> · Failed save", without the goblin\'s roll', player.messages, async () => {
      await showTab(player.page, characterId, 'actions');
      await player.page.waitForTimeout(1000);
      await player.page.locator(`[data-id="${flameId}-target-button"]`).first().click();
      await player.page.waitForSelector(`[data-id="target-option-${goblinId}"]`, { timeout: 15000 });
      await player.page.waitForTimeout(500);
      await player.page.locator(`[data-id="target-option-${goblinId}"] input`).check();
      const started = new Date();
      await player.page.locator('[data-id="target-picker-confirm"]').click();
      const log = await waitFor(() => ownEntry(characterId, 'E2E Flame', started), 'the character\'s entry');
      const save = log.content.find(line => line.name === `${goblinName} · Failed save`);
      if (!save || save.value) throw new Error(`the saving throw's line: ${JSON.stringify(log.content.map(line => [line.name, line.value]))}`);
      if (!log.content.some(line => /\*\*3\*\* radiant damage/.test(line.value || ''))) throw new Error('no damage dealt');
      const leaked = [...secrets, '1d20'].filter(secret => JSON.stringify(log.content).includes(secret));
      if (leaked.length) throw new Error(`the goblin's roll in the character's log: ${leaked.join(', ')}`);
      await waitFor(async () => !await dialogs(player.page).count(), 'the dialogs to close');
      return log.content.map(line => line.name).join(' · ');
    });

    await step('no frame the player\'s browser received holds the goblin\'s numbers', null, async () => {
      if (!frames.some(frame => frame.includes('E2E Lunge'))) throw new Error('the character\'s entries never arrived: the search proves nothing');
      // And what the hits left it
      const left = (await prop({ 'root.id': goblinId, variableName: 'hitPoints', attributeType: 'healthBar' }, { value: 1 }))?.value;
      if (!(left < 31415)) throw new Error(`the goblin's hit points: ${left}`);
      secrets.push(String(left));
      // Dates are numbers of their own
      const bare = frames.map(frame => frame.replace(/\{\\*"\$date\\*":\d+\}/g, '{}'));
      // Its numbers: its own lines' keys may be in the character's older
      // entries, about the character itself
      const leaks = secrets.filter(secret => bare.some(frame => frame.includes(secret)));
      if (leaks.length) throw new Error(`the player received: ${leaks.join(', ')}`);
      return `${frames.length} frames, none with ${secrets.join(', ')}`;
    });

    await step('"Players target the monsters" off on the board: the goblin leaves the player\'s picker, and the server refuses it', gm.messages, async () => {
      await visit(gm.page, `/party/${folderId}`, 4000);
      await removeOverlay(gm.page);
      const toggle = gm.page.locator('[data-id="party-players-target-monsters"] input');
      if (!await toggle.isChecked()) throw new Error('off before the game master turned it off');
      await toggle.uncheck();
      await waitFor(() => withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId }))
        .playersTargetMonsters === false), 'the switch saved');
      await showTab(player.page, characterId, 'actions');
      await player.page.waitForTimeout(1500);
      await player.page.locator(`[data-id="${lungeId}-target-button"]`).first().click();
      await player.page.waitForSelector('[data-id="target-picker-dialog"]', { timeout: 15000 });
      await player.page.waitForSelector(`[data-id="target-option-${characterId}"]`, { timeout: 15000 });
      await player.page.waitForTimeout(1000);
      const offered = await player.page.locator('[data-id^="target-option-"]').evaluateAll(
        options => options.map(option => option.getAttribute('data-id')),
      );
      if (offered.includes(`target-option-${goblinId}`)) throw new Error('the goblin is still offered');
      await popDialog(player.page);
      await waitFor(async () => !await dialogs(player.page).count(), 'the picker to close');
      const reason = await refusalOf(player.page, 'actions.insertAction', {
        action: { creatureId: characterId, task: { prop: { _id: lungeId }, targetIds: [goblinId] }, results: [], taskCount: 0 },
      });
      if (reason !== DENIED) throw new Error(`the server: ${reason === null ? 'accepted' : reason}`);
      await visit(player.page, `/party/${folderId}`, 4000);
      await removeOverlay(player.page);
      await player.page.waitForSelector(`[data-id="party-target-${characterId}"]`, { timeout: 15000 });
      if (await player.page.locator(`[data-id="party-target-${goblinId}"]`).count()) throw new Error('"Target" on the goblin\'s card');
      return `offered: ${offered.length - 1}; refused: "${reason}"`;
    });
  } finally {
    // Put everything back, through the app
    try {
      for (const _id of playerPropIds) await callAsPlayer?.('creatureProperties.softRemove', { _id });
      if (goblinId) await call('creatureFolders.monsters.endEncounter', { folderId, endCombat: true });
      if (folderId) {
        if (callAsPlayer) await callAsPlayer('creatureFolders.party.leave', { folderId });
        await call('creatureFolders.methods.remove', { _id: folderId });
      }
      if (!alreadyFollowed) await call('users.subscribeToLibrary', { libraryId: data.bestiary._id, subscribe: false });
    } finally {
      for (const browser of browsers) await browser.close().catch(() => {});
    }
  }
  finish();
});
