#!/usr/bin/env node
/**
 * Effect durations anchored on the turns of the creature that applied them
 * (phase 3.5). The test account makes a board that the other test account
 * joins with its character, and adds a goblin of the SRD 5.1 bestiary, which
 * gets a trigger at the end of its turn. The fight starts with the
 * character; on the goblin's turn the goblin frightens it: on the board, the
 * game master sets the condition to last "until the end of the next turn
 * of… Goblin", which its chip then says. The buff's viewer and form say whose
 * turns count it. The goblin's turn ends (the one it frightened in: not its
 * next turn), the character's starts and ends: the condition stays. The
 * goblin's next turn ends: the condition goes, and the character's log says
 * so under "End of Goblin's turn", which its player reads without a line of
 * the goblin's own turn. Everything is put back at the end: the board, the
 * goblin, the condition and the library subscription.
 */
const { openPage, visit, pushDialog } = require('../lib/browser');
const { withDb } = require('../lib/db');
const { USERNAME } = require('../lib/config');
const { createChecker, main } = require('../lib/check');

const OTHER = `${USERNAME}-other`;
const BESTIARY = 'SRD 5.1 Bestiary';
const CONDITION = 'E2E Frightened';
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

/** A creature's log entries written since `since`, oldest first, as the names of the lines they show */
const entries = (creatureId, since) => withDb(async db => (await db.collection('creatureLogs')
  .find({ creatureId, date: { $gte: since } }, { sort: { date: 1 } }).toArray())
  .map(log => (log.content || []).filter(line => !line.silenced).map(line => line.name)));

const condition = id => withDb(db => db.collection('creatureProperties').findOne({ _id: id }));
const tracker = () => withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderIdOf.id })).initiative);
const folderIdOf = { id: undefined };

async function waitFor(check, what, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
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
  const { step, finish } = createChecker('Effect durations anchored on a creature\'s turns');
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
  let conditionId;
  try {
    await step('a board with a player\'s character and a goblin of the bestiary, which has a trigger at the end of its turn', gm.messages, async () => {
      await visit(gm.page, '/character-list', 3000);
      if (!alreadyFollowed) await call('users.subscribeToLibrary', { libraryId: data.bestiary._id, subscribe: true });
      folderId = await call('creatureFolders.methods.insert', {});
      folderIdOf.id = folderId;
      await call('creatureFolders.methods.updateName', { _id: folderId, name: 'E2E anchored durations' });
      const token = await call('creatureFolders.party.createInvite', { folderId });
      const player = await openPage({ username: OTHER });
      browsers.push(player.browser);
      await visit(player.page, '/character-list', 3000);
      await caller(player.page)('creatureFolders.party.join', { token, creatureIds: [characterId] });
      await player.browser.close();
      await call('creatureFolders.monsters.add', { folderId, nodeId: data.goblin._id, count: 1 });
      const goblin = await withDb(async db => {
        const ids = (await db.collection('creatureFolders').findOne({ _id: folderId })).creatures;
        return db.collection('creatures').findOne({ _id: { $in: ids.filter(id => id !== characterId) } }, { projection: { name: 1 } });
      });
      if (!goblin) throw new Error('no goblin on the board');
      goblinId = goblin._id;
      goblinName = goblin.name;
      await call('creatureProperties.insert', {
        creatureProperty: { type: 'trigger', name: 'E2E goblin lair', event: 'turnEnd', timing: 'after' },
        parentRef: { collection: 'creatures', id: goblinId },
      });
      // The condition, as the board's palette gives it; the game master edits the character since it joined
      conditionId = await call('creatureProperties.insert', {
        creatureProperty: { type: 'buff', name: CONDITION, tags: ['condition', 'frightenedCondition'] },
        parentRef: { collection: 'creatures', id: characterId },
      });
      return goblinName;
    });

    await step('the fight starts with the character, then the goblin\'s turn', gm.messages, async () => {
      await call('creatureFolders.initiative.addCreatures', { folderId, creatureIds: [characterId, goblinId] });
      for (const entry of (await tracker()).entries) {
        await call('creatureFolders.initiative.update', {
          folderId, entryId: entry._id, initiative: entry.creatureId === characterId ? 20 : 10,
        });
      }
      await call('creatureFolders.initiative.advance', { folderId, step: 1 });
      await call('creatureFolders.initiative.advance', { folderId, step: 1 });
      const { round, turn } = await tracker();
      if (round !== 1 || turn !== 1) throw new Error(`round ${round}, turn ${turn}`);
    });

    await step('on the goblin\'s turn, the board\'s menu sets the condition until the end of the goblin\'s next turn; its chip says so', gm.messages, async () => {
      await visit(gm.page, `/party/${folderId}`, 5000);
      await removeOverlay(gm.page);
      await gm.page.click(`[data-id="party-condition-${conditionId}"]`);
      await gm.page.waitForSelector(`[data-id="party-condition-menu-${conditionId}"]`, { timeout: 10000 });
      const menu = (await gm.page.locator(`[data-id="party-condition-menu-${conditionId}"] .v-list-item-title`).allInnerTexts())
        .map(text => text.trim());
      for (const option of ['Until the start of its next turn', 'Until the end of its next turn',
        'Until the start of the next turn of…', 'Until the end of the next turn of…']) {
        if (!menu.includes(option)) throw new Error(`the menu offers ${JSON.stringify(menu)}`);
      }
      await gm.page.click('[data-id="party-condition-duration-source-turnEnd"]');
      const source = `[data-id="party-condition-source-turnEnd-${goblinId}"]`;
      await gm.page.waitForSelector(source, { timeout: 10000 });
      const sources = (await gm.page.locator('[data-id="party-condition-sources-turnEnd"] .v-list-item-title').allInnerTexts())
        .map(text => text.trim());
      if (JSON.stringify(sources) !== JSON.stringify([goblinName])) throw new Error(`the sources offered: ${JSON.stringify(sources)}`);
      await gm.page.click(source);
      await waitFor(async () => (await condition(conditionId))?.durationAnchor === 'source', 'the duration to be set');
      const buff = await condition(conditionId);
      if (buff.durationEvent !== 'turnEnd' || buff.appliedBy?.id !== goblinId || buff.duration?.calculation !== '1') {
        throw new Error(`the condition: ${JSON.stringify({ ...buff, description: undefined })}`);
      }
      const lasts = gm.page.locator(`[data-id="party-condition-lasts-${conditionId}"]`);
      await lasts.waitFor({ timeout: 10000 });
      const title = await lasts.getAttribute('title');
      if (title !== `Until the end of ${goblinName}'s next turn`) throw new Error(`the chip's title: "${title}"`);
      await gm.page.keyboard.press('Escape');
      await pause(500);
      return title;
    });

    await step('the condition\'s viewer and form say on whose turns, and when, it is counted down', gm.messages, async () => {
      await pushDialog(gm.page, 'creature-property-dialog', { _id: conditionId });
      try {
        await gm.page.waitForTimeout(2500);
        const viewer = await dialogText(gm.page);
        for (const text of ['At the end of the turns of the creature that applied it', goblinName]) {
          if (!viewer.includes(text)) throw new Error(`the viewer reads "${viewer.replace(/\s+/g, ' ').slice(0, 200)}"`);
        }
        const dialog = gm.page.locator('.dialog-stack .dialog-component').last();
        await dialog.locator('button', { hasText: /^\s*Edit\s*$/i }).first().click();
        await gm.page.waitForTimeout(2000);
        // Its section, closed at first
        await dialog.locator('.v-expansion-panel-title', { hasText: /^\s*Duration\s*$/ }).first().click();
        await gm.page.waitForTimeout(1000);
        const selected = async dataId => (await dialog.locator(`[data-id="${dataId}"] .v-btn--active`)
          .first().innerText({ timeout: 10000 })).trim();
        const event = await selected('buff-duration-event');
        const anchor = await selected('buff-duration-anchor');
        if (event !== 'The end of a turn' || anchor !== 'The creature that applied it') {
          throw new Error(`the form shows "${event}" and "${anchor}"`);
        }
        return `${event} · ${anchor}`;
      } finally {
        await popDialog(gm.page);
        await gm.page.waitForTimeout(1200);
      }
    });

    let since;
    await step('the goblin\'s turn ends (the one it frightened in), the character\'s starts and ends: the condition stays', gm.messages, async () => {
      since = new Date();
      // The goblin's turn ends, the character's starts; hers ends, the goblin's starts
      for (let i = 0; i < 2; i += 1) {
        await gm.page.click('[data-id="initiative-next"]');
        await pause(1500);
      }
      const { round, turn } = await tracker();
      if (round !== 2 || turn !== 1) throw new Error(`round ${round}, turn ${turn}`);
      const buff = await condition(conditionId);
      if (buff.removed) throw new Error('the condition ended');
      if (buff.durationSpent !== 0) throw new Error(`rounds spent: ${buff.durationSpent}, 0 expected once the goblin's turn started`);
      // The goblin's own turn end, in its log
      const goblin = await entries(goblinId, since);
      if (!goblin.some(lines => lines[0] === 'End of turn' && lines.includes('E2E goblin lair'))) {
        throw new Error(`the goblin's entries: ${JSON.stringify(goblin)}`);
      }
      if ((await entries(characterId, since)).length) throw new Error('the character logged something');
    });

    await step('the goblin\'s next turn ends: the condition goes, in the character\'s log under the goblin\'s turn', gm.messages, async () => {
      await gm.page.click('[data-id="initiative-next"]');
      await waitFor(async () => (await condition(conditionId))?.removed, 'the condition to end');
      const character = await entries(characterId, since);
      const expected = [[`End of ${goblinName}'s turn`, CONDITION]];
      if (JSON.stringify(character) !== JSON.stringify(expected)) throw new Error(`the character's entries: ${JSON.stringify(character)}`);
      await waitFor(() => gm.page.locator(`[data-id="party-condition-${conditionId}"]`).count().then(count => count === 0),
        'the chip to go from the board');
      return character[0].join(' · ');
    });

    await step(`${OTHER} reads it in their character's log, nothing of the goblin's turn`, null, async () => {
      const player = await openPage({ username: OTHER });
      browsers.push(player.browser);
      await visit(player.page, `/character/${characterId}`, 6000);
      await removeOverlay(player.page);
      const log = await player.page.evaluate(() => document.querySelector('.character-log')?.innerText || '');
      if (!log.includes(`End of ${goblinName}'s turn`) || !log.includes(CONDITION)) {
        throw new Error(`the character's log reads "${log.replace(/\s+/g, ' ').slice(0, 200)}"`);
      }
      if (log.includes('E2E goblin lair')) throw new Error('the goblin\'s turn in the character\'s log');
      await player.browser.close();
      if (player.messages.length) throw new Error(player.messages[0]);
    });
  } finally {
    // Put everything back, through the app
    try {
      if (conditionId && !(await condition(conditionId))?.removed) await call('creatureProperties.softRemove', { _id: conditionId });
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
