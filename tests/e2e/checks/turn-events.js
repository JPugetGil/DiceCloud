#!/usr/bin/env node
/**
 * Turn events on a party board (phase 3.1). The test account makes a board
 * that the other test account joins with its character, and adds a goblin of
 * the SRD 5.1 bestiary; it gives the goblin a trigger at the start of its turn
 * and legendary actions spent, which come back at the start of its turn, and
 * the character a trigger at the end of its turn. The trigger's viewer and
 * form, and the attribute's, name the new events. The fight starts with the
 * character: Next on the board ends its turn and starts the goblin's, each
 * logged once on its creature (the triggers' lines; the legendary actions
 * come back without a line: resets are silent); Previous then Next does
 * neither again. The game master reads the goblin's entry on
 * its sheet, the player their character's, never the goblin's. Everything is
 * put back at the end: the board, the goblin, the character's trigger and the
 * library subscription.
 */
const { openPage, visit, pushDialog } = require('../lib/browser');
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

/** A creature's log entries, oldest first, as the names of the lines they show */
const entries = creatureId => withDb(async db => (await db.collection('creatureLogs')
  .find({ creatureId }, { sort: { date: 1 } }).toArray())
  .map(log => (log.content || []).filter(line => !line.silenced).map(line => line.name)));

async function waitFor(condition, what, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await condition();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await pause(250);
  }
}

/** The text of the dialog on top of the stack */
const dialogText = page => page.evaluate(() => [...document.querySelectorAll('.dialog-stack .dialog-component')].pop()?.innerText || '');
const popDialog = page => page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s
  .get('dialogStack').popDialogStack());

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
  const { step, finish } = createChecker('Turn events on a party board');
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
  let triggerId;
  let legendaryId;
  let reminderId;
  try {
    await step('a board with a player\'s character and a goblin of the bestiary', gm.messages, async () => {
      await visit(gm.page, '/character-list', 3000);
      if (!alreadyFollowed) await call('users.subscribeToLibrary', { libraryId: data.bestiary._id, subscribe: true });
      folderId = await call('creatureFolders.methods.insert', {});
      await call('creatureFolders.methods.updateName', { _id: folderId, name: 'E2E turns' });
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
    });

    await step('the goblin\'s turn starts with a war cry and its legendary actions back; the character\'s ends with a reminder', gm.messages, async () => {
      const onGoblin = { collection: 'creatures', id: goblinId };
      triggerId = await call('creatureProperties.insert', {
        creatureProperty: { type: 'trigger', name: 'E2E war cry', event: 'turnStart', timing: 'after' },
        parentRef: onGoblin,
      });
      legendaryId = await call('creatureProperties.insert', {
        creatureProperty: {
          type: 'attribute', attributeType: 'resource', name: 'E2E Legendary Actions', variableName: 'e2eLegendaryActions',
          baseValue: { calculation: '3' }, damage: 2, reset: 'turnStart',
        },
        parentRef: onGoblin,
      });
      // The game master edits the character since it joined
      reminderId = await call('creatureProperties.insert', {
        creatureProperty: { type: 'trigger', name: 'E2E bardic reminder', event: 'turnEnd', timing: 'after' },
        parentRef: { collection: 'creatures', id: characterId },
      });
    });

    await step('the trigger and the attribute name their turn event; the trigger\'s form offers both', gm.messages, async () => {
      await visit(gm.page, `/character/${goblinId}`, 5000);
      await removeOverlay(gm.page);
      await pushDialog(gm.page, 'creature-property-dialog', { _id: triggerId });
      await gm.page.waitForTimeout(2500);
      const viewer = await dialogText(gm.page);
      if (!viewer.includes('Start of turn')) throw new Error(`the trigger's viewer reads "${viewer.replace(/\s+/g, ' ').slice(0, 120)}"`);
      // Its form: the event select lists the turn's start and end, read from
      // its menu as shown (a production build keeps no component on the DOM)
      const dialog = gm.page.locator('.dialog-stack .dialog-component').last();
      await dialog.locator('button', { hasText: /^\s*Edit\s*$/i }).first().click();
      await gm.page.waitForTimeout(2000);
      const eventSelect = dialog.locator('.v-select').filter({ has: gm.page.locator('label', { hasText: /^\s*Event\s*$/ }) }).first();
      await eventSelect.locator('.v-field').first().click();
      await gm.page.waitForSelector('.v-overlay--active .v-list-item', { timeout: 10000 });
      const options = (await gm.page.locator('.v-overlay--active .v-list-item-title').allInnerTexts()).map(text => text.trim());
      await gm.page.keyboard.press('Escape');
      await gm.page.waitForTimeout(500);
      if (!options.includes('Start of turn') || !options.includes('End of turn')) {
        throw new Error(`the event select offers ${JSON.stringify(options)}`);
      }
      await popDialog(gm.page);
      await gm.page.waitForTimeout(1200);
      await pushDialog(gm.page, 'creature-property-dialog', { _id: legendaryId });
      await gm.page.waitForTimeout(2500);
      const attribute = await dialogText(gm.page);
      if (!attribute.includes('Reset at the start of each turn')) {
        throw new Error(`the attribute's viewer reads "${attribute.replace(/\s+/g, ' ').slice(0, 160)}"`);
      }
      await popDialog(gm.page);
      await gm.page.waitForTimeout(800);
      return options.join(', ');
    });

    await step('the fight starts with the character\'s turn', gm.messages, async () => {
      await call('creatureFolders.initiative.addCreatures', { folderId, creatureIds: [characterId, goblinId] });
      const { entries: tracked } = await withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId })).initiative);
      for (const entry of tracked) {
        await call('creatureFolders.initiative.update', {
          folderId, entryId: entry._id, initiative: entry.creatureId === characterId ? 20 : 10,
        });
      }
      await call('creatureFolders.initiative.advance', { folderId, step: 1 });
      const tracker = await withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId })).initiative);
      if (tracker.round !== 1 || tracker.turn !== 0) throw new Error(`round ${tracker.round}, turn ${tracker.turn}`);
    });

    let before;
    await step('Next on the board: the character\'s turn ends, the goblin\'s starts, each logged once on its creature', gm.messages, async () => {
      await visit(gm.page, `/party/${folderId}`, 4000);
      await removeOverlay(gm.page);
      before = { character: (await entries(characterId)).length, goblin: (await entries(goblinId)).length };
      await gm.page.click('[data-id="initiative-next"]');
      await waitFor(async () => (await entries(goblinId)).length > before.goblin, 'the goblin\'s turn to start');
      await pause(1500);
      const goblin = (await entries(goblinId)).slice(before.goblin);
      const character = (await entries(characterId)).slice(before.character);
      // Its legendary actions come back silently: a reset alone is no news
      if (JSON.stringify(goblin) !== JSON.stringify([['Start of turn', 'E2E war cry']])) {
        throw new Error(`the goblin's entries: ${JSON.stringify(goblin)}`);
      }
      if (JSON.stringify(character) !== JSON.stringify([['End of turn', 'E2E bardic reminder']])) {
        throw new Error(`the character's entries: ${JSON.stringify(character)}`);
      }
      const legendary = await withDb(db => db.collection('creatureProperties').findOne({ _id: legendaryId }));
      if (legendary.damage !== 0) throw new Error(`legendary actions spent: ${legendary.damage}`);
      return `${goblin[0].join(' · ')} | ${character[0].join(' · ')}`;
    });

    await step('Previous then Next: nothing starts or ends a second time', gm.messages, async () => {
      await gm.page.click('[data-id="initiative-previous"]');
      await pause(1500);
      await gm.page.click('[data-id="initiative-next"]');
      await pause(3000);
      const tracker = await withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId })).initiative);
      if (tracker.round !== 1 || tracker.turn !== 1) throw new Error(`round ${tracker.round}, turn ${tracker.turn}`);
      const counts = { character: (await entries(characterId)).length, goblin: (await entries(goblinId)).length };
      if (counts.goblin !== before.goblin + 1 || counts.character !== before.character + 1) {
        throw new Error(`entries before ${JSON.stringify(before)}, now ${JSON.stringify(counts)}`);
      }
    });

    await step('the game master reads the goblin\'s entry on its sheet', gm.messages, async () => {
      await visit(gm.page, `/character/${goblinId}`, 5000);
      await removeOverlay(gm.page);
      const log = await gm.page.evaluate(() => document.querySelector('.character-log')?.innerText || '');
      if (!log.includes('Start of turn') || !log.includes('E2E war cry')) {
        throw new Error(`the goblin's log reads "${log.replace(/\s+/g, ' ').slice(0, 160)}"`);
      }
    });

    await step(`${OTHER} reads their character's entry, and nothing of the goblin's`, null, async () => {
      const player = await openPage({ username: OTHER });
      browsers.push(player.browser);
      await visit(player.page, `/character/${characterId}`, 6000);
      await removeOverlay(player.page);
      const log = await player.page.evaluate(() => document.querySelector('.character-log')?.innerText || '');
      if (!log.includes('End of turn') || !log.includes('E2E bardic reminder')) {
        throw new Error(`the character's log reads "${log.replace(/\s+/g, ' ').slice(0, 160)}"`);
      }
      if (log.includes('E2E war cry')) throw new Error('the goblin\'s entry in the character\'s log');
      await player.browser.close();
      if (player.messages.length) throw new Error(player.messages[0]);
    });
  } finally {
    // Put everything back, through the app
    try {
      if (reminderId) await call('creatureProperties.softRemove', { _id: reminderId });
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
