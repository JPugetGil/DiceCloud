#!/usr/bin/env node
/**
 * The target picker, and the game master's monster attacking a player's
 * character (phase 2.1). The test account makes a board that the other test
 * account joins with its character, adds a goblin of the SRD 5.1 bestiary and
 * starts a fight. On the goblin's sheet, its Scimitar opens the target picker
 * by itself; the game master picks the character (given an armor class and
 * hit points for the step), rolls, and the character's own log gets "Goblin
 * → you", with the attack's total and the damage
 * dealt, never the goblin's bonus, formula or stat block text. "Target" on a
 * board's card preselects that creature next time, in the cast dialog too,
 * whose target menu casts a cantrip at the character. Out of the fight, the
 * Scimitar no longer asks, and its "Target…" button opens the picker with no
 * target; picked, the character is hit, the action's dialog reading its armor
 * class from the board. An event's button never asks. The player reads the
 * entry in their character's log. Everything is put back.
 */
const { openPage, visit, pushDialog } = require('../lib/browser');
const { withDb } = require('../lib/db');
const { USERNAME } = require('../lib/config');
const { createChecker, main } = require('../lib/check');

const OTHER = `${USERNAME}-other`;
const BESTIARY = 'SRD 5.1 Bestiary';
// What the goblin's stat block says of its Scimitar, which no player may read
// (the bestiary: +4 to hit, 5 (1d6 + 2) slashing damage)
const GOBLIN_SECRETS = ['+4', '+ 4', '1d6', 'Melee Weapon Attack'];
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

const latestReceived = (creatureId, fromCreatureId) => withDb(db => db.collection('creatureLogs')
  .findOne({ creatureId, 'received.fromCreatureId': fromCreatureId }, { sort: { date: -1 } }));

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
  const { step, finish } = createChecker('Target picker: the game master\'s goblin attacks a player\'s character');
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
  let folderId;
  let goblinId;
  let goblinName;
  let scimitarId;
  // What the step gives the character for the goblin to hit, then takes back
  const characterPropIds = [];
  try {
    await step('a board with a player\'s character and a goblin, fighting', gm.messages, async () => {
      await visit(gm.page, '/character-list', 3000);
      if (!alreadyFollowed) await call('users.subscribeToLibrary', { libraryId: data.bestiary._id, subscribe: true });
      folderId = await call('creatureFolders.methods.insert', {});
      await call('creatureFolders.methods.updateName', { _id: folderId, name: 'E2E targeting' });
      const token = await call('creatureFolders.party.createInvite', { folderId });
      const player = await openPage({ username: OTHER });
      browsers.push(player.browser);
      await visit(player.page, '/character-list', 3000);
      await caller(player.page)('creatureFolders.party.join', { token, creatureIds: [characterId] });
      await player.browser.close();
      await call('creatureFolders.monsters.add', { folderId, nodeId: data.goblin._id, count: 1 });
      goblinId = await withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId })).creatures
        .find(id => id !== characterId));
      if (!goblinId) throw new Error('no goblin on the board');
      goblinName = (await withDb(db => db.collection('creatures').findOne({ _id: goblinId }, { projection: { name: 1 } }))).name;
      // An armor class and hit points, which the test character lacks: the
      // goblin hits it (+4 against 5) and damages it. The game master may
      // edit it, since it joined
      for (const creatureProperty of [
        { type: 'attribute', attributeType: 'stat', name: 'E2E Armor Class', variableName: 'armor', baseValue: { calculation: '5' } },
        { type: 'attribute', attributeType: 'healthBar', name: 'E2E Hit Points', variableName: 'hitPoints', baseValue: { calculation: '200' } },
      ]) {
        characterPropIds.push(await call('creatureProperties.insert', {
          creatureProperty, parentRef: { collection: 'creatures', id: characterId },
        }));
      }
      scimitarId = await waitFor(() => withDb(async db => (await db.collection('creatureProperties').findOne(
        { 'root.id': goblinId, type: 'action', name: 'Scimitar', removed: { $ne: true } }, { projection: { _id: 1 } },
      ))?._id), 'the goblin\'s Scimitar');
      await call('creatureFolders.initiative.addCreatures', { folderId, creatureIds: [characterId, goblinId] });
      const { entries: tracked } = await withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId })).initiative);
      for (const entry of tracked) {
        await call('creatureFolders.initiative.update', {
          folderId, entryId: entry._id, initiative: entry.creatureId === goblinId ? 20 : 10,
        });
      }
      await call('creatureFolders.initiative.advance', { folderId, step: 1 });
      const tracker = await withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId })).initiative);
      if (!(tracker.round > 0)) throw new Error(`round ${tracker.round}: no fight`);
    });

    await step('the goblin\'s Scimitar opens the target picker by itself during the fight', gm.messages, async () => {
      await visit(gm.page, `/character/${goblinId}`, 5000);
      await removeOverlay(gm.page);
      await showTab(gm.page, goblinId, 'actions');
      await gm.page.waitForTimeout(1500);
      await gm.page.locator(`[data-id="${scimitarId}-do-action-button"]`).first().click();
      await gm.page.waitForSelector('[data-id="target-picker-dialog"]', { timeout: 15000 });
      await gm.page.waitForSelector(`[data-id="target-option-${characterId}"]`, { timeout: 15000 });
      const offered = await gm.page.locator('[data-id^="target-option-"]').evaluateAll(
        options => options.map(option => option.getAttribute('data-id')),
      );
      for (const id of ['none', characterId, goblinId]) {
        if (!offered.includes(`target-option-${id}`)) throw new Error(`not offered: ${id} (${offered.join(', ')})`);
      }
      if (!await gm.page.locator('[data-id="target-option-none"] input').isChecked()) {
        throw new Error('"No target" is not preselected the first time');
      }
      return `${offered.length - 1} creatures offered`;
    });

    await step('the game master picks the character and rolls: the character\'s log says "Goblin → you", the totals only', gm.messages, async () => {
      await gm.page.locator(`[data-id="target-option-${characterId}"] input`).check();
      await gm.page.locator('[data-id="target-picker-confirm"]').click();
      // The attack's advantage, in the action's dialog that took the picker's place
      await gm.page.waitForSelector('.dialog-stack .action-dialog', { timeout: 15000 });
      await gm.page.locator('.dialog-stack #roll-hex').first().click();
      await gm.page.locator('.dialog-stack .done-button').first().click({ timeout: 15000 });
      const log = await waitFor(() => latestReceived(characterId, goblinId), 'the character\'s entry');
      const names = log.content.map(line => line.name);
      if (names[0] !== `${goblinName} → you`) throw new Error(`its heading: ${names[0]}`);
      if (!names.includes('Scimitar')) throw new Error(`its lines: ${names.join(' · ')}`);
      // Hit or missed (a 1), the total alone
      const attack = log.content.find(line => /^(Hit|Miss|Critical)/.test(line.name || ''));
      if (!attack || !/^\*\*\d+\*\*$/.test(attack.value || '')) throw new Error(`the attack's line: ${JSON.stringify(attack)}`);
      // Hit: the damage dealt alone, and the character's hit points
      if (/^(Hit|Critical hit)/.test(attack.name)) {
        const damage = log.content.find(line => line.name === 'Damage');
        if (!/^\*\*\d+\*\* (critical )?slashing damage$/.test(damage?.value || '')) {
          throw new Error(`the damage's line: ${JSON.stringify(damage)}`);
        }
        if (!log.content.some(line => /E2E Hit Points/.test(line.value || ''))) throw new Error('no hit points lost');
      }
      const text = JSON.stringify(log.content);
      const leaked = GOBLIN_SECRETS.filter(secret => text.includes(secret));
      if (leaked.length) throw new Error(`the goblin's numbers in the character's log: ${leaked.join(', ')}`);
      await waitFor(async () => !await dialogs(gm.page).count(), 'the dialogs to close');
      return names.join(' · ');
    });

    await step('"Target" on the goblin\'s card preselects it next time', gm.messages, async () => {
      await visit(gm.page, `/party/${folderId}`, 4000);
      await removeOverlay(gm.page);
      await gm.page.locator(`[data-id="party-target-${goblinId}"]`).first().click();
      await gm.page.waitForTimeout(500);
      if (await gm.page.locator(`[data-id="party-target-${goblinId}"]`).first().getAttribute('aria-pressed') !== 'true') {
        throw new Error('the card\'s Target button is not pressed');
      }
      await visit(gm.page, `/character/${goblinId}`, 5000);
      await removeOverlay(gm.page);
      await showTab(gm.page, goblinId, 'actions');
      await gm.page.waitForTimeout(1500);
      await gm.page.locator(`[data-id="${scimitarId}-do-action-button"]`).first().click();
      await gm.page.waitForSelector(`[data-id="target-option-${goblinId}"]`, { timeout: 15000 });
      await gm.page.waitForTimeout(500);
      if (!await gm.page.locator(`[data-id="target-option-${goblinId}"] input`).isChecked()) {
        throw new Error('the board\'s pick is not preselected');
      }
      await popDialog(gm.page);
      await gm.page.waitForTimeout(1000);
    });

    await step('the cast dialog preselects the board\'s pick; its target menu casts a cantrip at the character', gm.messages, async () => {
      const spellId = await call('creatureProperties.insert', {
        creatureProperty: {
          type: 'spell', name: 'E2E Spark', level: 0, alwaysPrepared: true, target: 'singleTarget',
        },
        parentRef: { collection: 'creatures', id: goblinId },
      });
      characterPropIds.push(spellId);
      await call('creatureProperties.insert', {
        creatureProperty: { type: 'damage', target: 'target', damageType: 'fire', amount: { calculation: '1d4' } },
        parentRef: { collection: 'creatureProperties', id: spellId },
      });
      await gm.page.waitForTimeout(1500);
      await pushDialog(gm.page, 'cast-spell-with-slot-dialog', { creatureId: goblinId, spellId });
      const targets = gm.page.locator('[data-id="cast-spell-targets"]');
      await targets.waitFor({ timeout: 15000 });
      await waitFor(async () => (await targets.innerText()).includes(goblinName), 'the board\'s pick as the target', 10000);
      await targets.click();
      await gm.page.locator(`[data-id="cast-spell-target-picker"] [data-id="target-option-${characterId}"] input`).check();
      await gm.page.keyboard.press('Escape');
      await gm.page.waitForTimeout(500);
      if (!(await targets.innerText()).includes(data.character.name)) throw new Error(`the target reads "${await targets.innerText()}"`);
      const before = (await latestReceived(characterId, goblinId))?._id;
      await gm.page.locator('[data-id="cast-spell-dialog-btn"]').click();
      const log = await waitFor(async () => {
        const latest = await latestReceived(characterId, goblinId);
        return latest && latest._id !== before && latest;
      }, 'the spell\'s entry in the character\'s log');
      const names = log.content.map(line => line.name);
      if (!names.includes('E2E Spark')) throw new Error(`its lines: ${names.join(' · ')}`);
      await waitFor(async () => !await dialogs(gm.page).count(), 'the cast dialog to close');
      return names.join(' · ');
    });

    await step('an event\'s button runs without asking for a target, single target though it is', gm.messages, async () => {
      // The libraries leave most events on their default, a single target
      const eventId = await call('creatureProperties.insert', {
        creatureProperty: { type: 'action', actionType: 'event', name: 'E2E Roar', target: 'singleTarget' },
        parentRef: { collection: 'creatures', id: goblinId },
      });
      characterPropIds.push(eventId);
      const before = await withDb(db => db.collection('creatureLogs').countDocuments({ creatureId: goblinId }));
      await visit(gm.page, `/character/${goblinId}`, 5000);
      await removeOverlay(gm.page);
      await showTab(gm.page, goblinId, 'stats');
      await gm.page.locator(`[data-id="event-btn-${eventId}"]`).first().click();
      await waitFor(() => withDb(async db => await db.collection('creatureLogs').countDocuments({ creatureId: goblinId }) > before),
        'the event\'s entry');
      if (await gm.page.locator('[data-id="target-picker-dialog"]').count()) throw new Error('the picker opened for an event');
    });

    await step('out of the fight, the Scimitar does not ask; "Target…" opens the picker without a target, and applies it to the one picked', gm.messages, async () => {
      await call('creatureFolders.initiative.end', { folderId });
      await showTab(gm.page, goblinId, 'actions');
      await gm.page.waitForTimeout(1500);
      // The Scimitar goes straight to its roll, without a target
      await gm.page.locator(`[data-id="${scimitarId}-do-action-button"]`).first().click();
      await gm.page.waitForSelector('.dialog-stack .action-dialog', { timeout: 15000 });
      if (await gm.page.locator('[data-id="target-picker-dialog"]').count()) throw new Error('the picker opened out of a fight');
      await popDialog(gm.page);
      await waitFor(async () => !await dialogs(gm.page).count(), 'the action\'s dialog to close');
      await gm.page.locator(`[data-id="${scimitarId}-target-button"]`).first().click();
      await gm.page.waitForSelector(`[data-id="target-option-${characterId}"]`, { timeout: 15000 });
      await gm.page.waitForTimeout(500);
      if (!await gm.page.locator('[data-id="target-option-none"] input').isChecked()) {
        throw new Error('out of a fight, the picker preselects a target');
      }
      // Picked: the action's own dialog, which takes the picker's place,
      // still reads the character's armor class from its party's board
      await gm.page.locator(`[data-id="target-option-${characterId}"] input`).check();
      const before = (await latestReceived(characterId, goblinId))?._id;
      await gm.page.locator('[data-id="target-picker-confirm"]').click();
      await gm.page.waitForSelector('.dialog-stack .action-dialog', { timeout: 15000 });
      await gm.page.waitForTimeout(3000);
      await gm.page.locator('.dialog-stack #roll-hex').first().click();
      await gm.page.waitForTimeout(2000);
      const preview = await gm.page.evaluate(() => document.querySelector('.dialog-stack .log-preview')?.innerText || '');
      if (!/Hit!|Miss!|Critical/.test(preview) || /armor/.test(preview)) {
        throw new Error(`the action's preview: ${JSON.stringify(preview.replace(/\s+/g, ' ').slice(0, 160))}`);
      }
      await gm.page.locator('.dialog-stack .done-button').first().click({ timeout: 15000 });
      await waitFor(async () => {
        const latest = await latestReceived(characterId, goblinId);
        return latest && latest._id !== before;
      }, 'the character\'s entry, out of the fight');
      await waitFor(async () => !await dialogs(gm.page).count(), 'the dialogs to close');
    });

    await step(`${OTHER} reads the entry in their character's log, without the goblin's numbers`, null, async () => {
      const player = await openPage({ username: OTHER });
      browsers.push(player.browser);
      await visit(player.page, `/character/${characterId}`, 6000);
      await removeOverlay(player.page);
      // The goblin's latest entry alone: the character's log holds the
      // character's own entries too, of other checks (its rolls' bonuses)
      const entryId = (await latestReceived(characterId, goblinId))?._id;
      const log = await player.page.evaluate(id => document.querySelector(`[data-id="log-entry-${id}"]`)?.innerText || '', entryId);
      if (!log.includes(`${goblinName} →`)) throw new Error(`the goblin's entry reads "${log.replace(/\s+/g, ' ').slice(0, 200)}"`);
      const leaked = GOBLIN_SECRETS.filter(secret => log.includes(secret));
      if (leaked.length) throw new Error(`the goblin's numbers in the log: ${leaked.join(', ')}`);
      await player.browser.close();
      if (player.messages.length) throw new Error(player.messages[0]);
    });
  } finally {
    // Put everything back, through the app
    try {
      for (const _id of characterPropIds) await call('creatureProperties.softRemove', { _id });
      if (goblinId) await call('creatureFolders.monsters.endEncounter', { folderId, endCombat: true });
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
