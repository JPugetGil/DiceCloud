#!/usr/bin/env node
/**
 * Undoing what a character received (phase 2.4): the player's answer to a
 * monster's attack that applied by itself (Shield, Lucky, a resistance
 * forgotten). The test account makes a board that the other test account
 * joins with its character, and adds a goblin of the SRD 5.1 bestiary: an
 * encounter. The goblin hits the character (an action of the step's, without
 * a roll); the character's log gets "Goblin → you" with an "Undo" button,
 * for its player. The player undoes it from the log: the hit points come
 * back, the entry says who undid it, a new entry says so too, and the button
 * is gone; a second undo is refused by the server. Hit again, then the game
 * master ends the encounter: the button goes, and the server refuses.
 * Everything is put back.
 */
const { openPage, visit } = require('../lib/browser');
const { withDb } = require('../lib/db');
const { USERNAME } = require('../lib/config');
const { createChecker, main } = require('../lib/check');

const OTHER = `${USERNAME}-other`;
const BESTIARY = 'SRD 5.1 Bestiary';
const HIT = 9;
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

/** The error a method call is refused with, its reason and message key, or null when it is not */
const refusalOf = (page, name, args) => page.evaluate(({ name, args }) => window.Meteor.callAsync(name, args)
  .then(() => null, e => ({ reason: e.reason || e.message, key: e.details?.i18n?.key })), { name, args });

const removeOverlay = page => page.evaluate(() => document.querySelector('#rspack-dev-server-client-overlay')?.remove());

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
const entry = logId => withDb(db => db.collection('creatureLogs').findOne({ _id: logId }));
const damageOf = propId => withDb(async db => (await db.collection('creatureProperties').findOne({ _id: propId }))?.damage || 0);

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
  const { step, finish } = createChecker('Undo: a player undoes the game master\'s goblin\'s hit on their character');
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
  let folderId;
  let goblinId;
  let goblinName;
  let clubId;
  let hitPointsId;
  let undoneId;
  // What the step gives the character, then takes back
  const characterPropIds = [];

  // The goblin's club on the character, as its sheet runs it: the entry it gets
  async function goblinHits() {
    const before = (await latestReceived(characterId, goblinId))?._id;
    const actionId = await call('actions.insertAction', {
      action: { creatureId: goblinId, task: { prop: { _id: clubId }, targetIds: [characterId] }, results: [], taskCount: 0 },
    });
    await call('actions.runAction', { actionId, decisions: [] });
    return waitFor(async () => {
      const latest = await latestReceived(characterId, goblinId);
      return latest && latest._id !== before && latest;
    }, 'the character\'s entry');
  }

  try {
    await step('a board with a player\'s character and a goblin: an encounter', gm.messages, async () => {
      await visit(gm.page, '/character-list', 3000);
      if (!alreadyFollowed) await call('users.subscribeToLibrary', { libraryId: data.bestiary._id, subscribe: true });
      folderId = await call('creatureFolders.methods.insert', {});
      await call('creatureFolders.methods.updateName', { _id: folderId, name: 'E2E undo' });
      const token = await call('creatureFolders.party.createInvite', { folderId });
      player = await openPage({ username: OTHER });
      browsers.push(player.browser);
      await visit(player.page, '/character-list', 3000);
      await caller(player.page)('creatureFolders.party.join', { token, creatureIds: [characterId] });
      await call('creatureFolders.monsters.add', { folderId, nodeId: data.goblin._id, count: 1 });
      goblinId = await withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId })).creatures
        .find(id => id !== characterId));
      if (!goblinId) throw new Error('no goblin on the board');
      goblinName = (await withDb(db => db.collection('creatures').findOne({ _id: goblinId }, { projection: { name: 1 } }))).name;
      // Hit points that take the damage first, which the game master may
      // give: the character joined the party
      hitPointsId = await call('creatureProperties.insert', {
        creatureProperty: {
          type: 'attribute', attributeType: 'healthBar', name: 'E2E Hit Points', variableName: 'e2eHitPoints',
          baseValue: { calculation: '200' }, healthBarDamageOrder: -100,
        },
        parentRef: { collection: 'creatures', id: characterId },
      });
      characterPropIds.push(hitPointsId);
      // A club without a roll: it hits
      clubId = await call('creatureProperties.insert', {
        creatureProperty: { type: 'action', name: 'E2E Club', target: 'singleTarget' },
        parentRef: { collection: 'creatures', id: goblinId },
      });
      await call('creatureProperties.insert', {
        creatureProperty: { type: 'damage', target: 'target', damageType: 'bludgeoning', amount: { calculation: String(HIT) } },
        parentRef: { collection: 'creatureProperties', id: clubId },
      });
      // The server computes the creatures someone has open: their sheets
      await visit(gm.page, `/character/${characterId}`, 3000);
      await waitFor(() => withDb(async db => (await db.collection('creatureProperties').findOne({ _id: hitPointsId }))?.total === 200),
        'the hit points computed');
      await visit(gm.page, `/character/${goblinId}`, 3000);
    });

    await step('the goblin hits the character: its log gets the entry, its hit points go down', gm.messages, async () => {
      const received = await goblinHits();
      undoneId = received._id;
      if (received.content[0].name !== `${goblinName} → you`) throw new Error(`its heading: ${received.content[0].name}`);
      if (await damageOf(hitPointsId) !== HIT) throw new Error(`hurt by ${await damageOf(hitPointsId)}, not ${HIT}`);
      if (!received.received?.reversible || !received.received?.encounter) {
        throw new Error(`what undoes it: ${JSON.stringify(received.received)}`);
      }
      if (received.received.revert?.[0]?.op !== 'inc') throw new Error('nothing to undo stored');
    });

    await step(`${OTHER} undoes it from the character's log: the hit points come back, and the entry says who`, null, async () => {
      await visit(player.page, `/character/${characterId}`, 6000);
      await removeOverlay(player.page);
      const button = player.page.locator(`[data-id="log-entry-${undoneId}"] [data-id="log-undo-button"]`);
      await button.waitFor({ timeout: 15000 });
      player.messages.length = 0;
      await button.click();
      await player.page.locator('[data-id="log-undo-confirm"]').click({ timeout: 10000 });
      await waitFor(async () => await damageOf(hitPointsId) === 0, 'the hit points back');
      const undone = (await entry(undoneId)).received.undone;
      if (undone?.name !== OTHER) throw new Error(`undone by ${JSON.stringify(undone)}`);
      const shown = player.page.locator(`[data-id="log-entry-${undoneId}"] [data-id="log-undone"]`);
      await shown.waitFor({ timeout: 10000 });
      if (!(await shown.innerText()).includes(`Effect undone by ${OTHER}`)) throw new Error(`it reads "${await shown.innerText()}"`);
      if (await player.page.locator(`[data-id="log-entry-${undoneId}"] [data-id="log-undo-button"]`).count()) {
        throw new Error('the button is still there');
      }
      // Its own entry in the log, as the party's table reads it
      const told = await withDb(db => db.collection('creatureLogs').findOne(
        { creatureId: characterId, 'content.0.i18n.name.key': 'logs.undoneBy' }, { sort: { date: -1 } },
      ));
      if (!told || !JSON.stringify(told.content).includes(`+${HIT} E2E Hit Points`)) {
        throw new Error(`the undo's entry: ${JSON.stringify(told?.content)}`);
      }
      await waitFor(() => player.page.locator(`[data-id="log-entry-${told._id}"]`).count(), 'the undo\'s entry in the log');
      if (player.messages.length) throw new Error(player.messages[0]);
    });

    await step('a second undo is refused, and changes nothing', null, async () => {
      const refused = await refusalOf(player.page, 'creatureLogs.revertReceived', { logId: undoneId });
      if (refused?.key !== 'log.undo.errors.alreadyUndone') throw new Error(`refused with ${JSON.stringify(refused)}`);
      if (await damageOf(hitPointsId) !== 0) throw new Error('the hit points changed');
      return refused.reason;
    });

    await step('hit again, then the game master ends the encounter: the button goes, and the server refuses', gm.messages, async () => {
      const received = await goblinHits();
      const button = player.page.locator(`[data-id="log-entry-${received._id}"] [data-id="log-undo-button"]`);
      await button.waitFor({ timeout: 15000 });
      await call('creatureFolders.monsters.endEncounter', { folderId, endCombat: true });
      goblinId = undefined;
      await waitFor(async () => !await button.count(), 'the button to go');
      const refused = await refusalOf(player.page, 'creatureLogs.revertReceived', { logId: received._id });
      if (refused?.key !== 'log.undo.errors.encounterOver') throw new Error(`refused with ${JSON.stringify(refused)}`);
      if (await damageOf(hitPointsId) !== HIT) throw new Error('the hit points changed');
      if (player.messages.length) throw new Error(player.messages[0]);
      return refused.reason;
    });
  } finally {
    // Put everything back, through the app
    try {
      for (const _id of characterPropIds) await call('creatureProperties.softRemove', { _id });
      if (goblinId) await call('creatureFolders.monsters.endEncounter', { folderId, endCombat: true });
      if (folderId) {
        if (player) await caller(player.page)('creatureFolders.party.leave', { folderId });
        await call('creatureFolders.methods.remove', { _id: folderId });
      }
      if (!alreadyFollowed) await call('users.subscribeToLibrary', { libraryId: data.bestiary._id, subscribe: false });
    } finally {
      for (const browser of browsers) await browser.close().catch(() => {});
    }
  }
  finish();
});
