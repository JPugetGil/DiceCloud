#!/usr/bin/env node
/**
 * A legendary monster on a party board (phases 3.2 and 3.3). The test account
 * makes a board that the other test account joins with its character, adds
 * an adult red dragon of the SRD 5.1 bestiary and starts a fight, the
 * character first. The game master's initiative tracker shows the dragon's
 * legendary actions, "3/3"; the player's shows nothing of them. On the
 * character's turn the menu offers the dragon's options with their cost,
 * without a word of its own turn; its Tail Attack opens the target picker,
 * the character picked, the attack rolled: the character's log gets the
 * dragon's tail, and the tracker reads "2/3". The player casts a saving throw
 * the dragon always fails at it: its legendary resistance turns it into a
 * success, which the player reads, "<dragon> · Failed → success (legendary
 * resistance)", without its roll. The game master spent its Fire Breath;
 * Next starts the dragon's turn: its log rolls the breath's recharge, the
 * breath back on a 5 or 6 only, and its legendary actions are back, "3/3".
 * On its own turn, the menu says so. Everything is put back.
 */
const { openPage, visit } = require('../lib/browser');
const { withDb } = require('../lib/db');
const { USERNAME } = require('../lib/config');
const { createChecker, main } = require('../lib/check');

const OTHER = `${USERNAME}-other`;
const BESTIARY = 'SRD 5.1 Bestiary';
const DRAGON = 'Adult Red Dragon';
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

const prop = (filter, projection) => withDb(db => db.collection('creatureProperties')
  .findOne({ removed: { $ne: true }, ...filter }, projection && { projection }));
const latestReceived = (creatureId, fromCreatureId) => withDb(db => db.collection('creatureLogs')
  .findOne({ creatureId, 'received.fromCreatureId': fromCreatureId }, { sort: { date: -1 } }));
/** The creature's own entry of an action named so, written after `since` */
const ownEntry = (creatureId, name, since) => withDb(db => db.collection('creatureLogs').findOne(
  { creatureId, date: { $gte: since }, 'content.name': name, received: { $exists: false } }, { sort: { date: -1 } },
));
const chipText = async (page, entryId) => (await page.locator(`[data-id="initiative-legendary-${entryId}"]`).innerText()).trim();

main(async () => {
  const data = await withDb(async db => {
    const gm = await db.collection('users').findOne({ username: USERNAME }, { projection: { subscribedLibraries: 1 } });
    const player = await db.collection('users').findOne({ username: OTHER }, { projection: { _id: 1 } });
    const bestiary = await db.collection('libraries').findOne({ name: BESTIARY }, { projection: { _id: 1 } });
    const dragon = bestiary && await db.collection('libraryNodes').findOne(
      { 'root.id': bestiary._id, type: 'creature', name: DRAGON, removed: { $ne: true } }, { projection: { _id: 1 } },
    );
    const character = player && await db.collection('creatures').findOne(
      { owner: player._id, type: 'pc' }, { projection: { _id: 1, name: 1 } },
    );
    return { gm, player, bestiary, dragon, character };
  });
  const { step, finish } = createChecker('A legendary monster: legendary actions, legendary resistance, recharge');
  if (!data.bestiary || !data.dragon) {
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
  let folderId;
  let dragonId;
  let dragonName;
  let entryId;
  let options;
  // What the step gives the character, then takes back
  const characterPropIds = [];
  try {
    await step(`a board with the player's character and an ${DRAGON}, fighting, the character first`, gm.messages, async () => {
      await visit(gm.page, '/character-list', 3000);
      if (!alreadyFollowed) await call('users.subscribeToLibrary', { libraryId: data.bestiary._id, subscribe: true });
      folderId = await call('creatureFolders.methods.insert', {});
      await call('creatureFolders.methods.updateName', { _id: folderId, name: 'E2E legendary' });
      const token = await call('creatureFolders.party.createInvite', { folderId });
      player = await openPage({ username: OTHER });
      browsers.push(player.browser);
      callAsPlayer = caller(player.page);
      await visit(player.page, '/character-list', 3000);
      await callAsPlayer('creatureFolders.party.join', { token, creatureIds: [characterId] });
      await call('creatureFolders.monsters.add', { folderId, nodeId: data.dragon._id, count: 1 });
      dragonId = await withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId })).creatures
        .find(id => id !== characterId));
      if (!dragonId) throw new Error('no dragon on the board');
      dragonName = (await withDb(db => db.collection('creatures').findOne({ _id: dragonId }, { projection: { name: 1 } }))).name;
      // An armor class and hit points the dragon's tail hits (+14 against 5);
      // and the player's spell: a Wisdom save no dragon makes
      for (const creatureProperty of [
        { type: 'attribute', attributeType: 'stat', name: 'E2E Armor Class', variableName: 'armor', baseValue: { calculation: '5' } },
        { type: 'attribute', attributeType: 'healthBar', name: 'E2E Hit Points', variableName: 'hitPoints', baseValue: { calculation: '500' } },
      ]) {
        characterPropIds.push(await callAsPlayer('creatureProperties.insert', {
          creatureProperty, parentRef: { collection: 'creatures', id: characterId },
        }));
      }
      const holdId = await callAsPlayer('creatureProperties.insert', {
        creatureProperty: { type: 'action', name: 'E2E Hold Monster', target: 'singleTarget' },
        parentRef: { collection: 'creatures', id: characterId },
      });
      characterPropIds.push(holdId);
      const save = await callAsPlayer('creatureProperties.insert', {
        creatureProperty: { type: 'savingThrow', name: 'E2E Hold Monster', target: 'target', dc: { calculation: '40' }, stat: 'wisdomSave' },
        parentRef: { collection: 'creatureProperties', id: holdId },
      });
      for (const [branchType, name] of [['failedSave', 'E2E Held'], ['successfulSave', 'E2E Shrugged off']]) {
        const branch = await callAsPlayer('creatureProperties.insert', {
          creatureProperty: { type: 'branch', branchType },
          parentRef: { collection: 'creatureProperties', id: save },
        });
        await callAsPlayer('creatureProperties.insert', {
          creatureProperty: { type: 'note', name },
          parentRef: { collection: 'creatureProperties', id: branch },
        });
      }
      await call('creatureFolders.initiative.addCreatures', { folderId, creatureIds: [characterId, dragonId] });
      const { entries: tracked } = await withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId })).initiative);
      for (const entry of tracked) {
        await call('creatureFolders.initiative.update', {
          folderId, entryId: entry._id, initiative: entry.creatureId === characterId ? 20 : 10,
        });
      }
      entryId = tracked.find(entry => entry.creatureId === dragonId)._id;
      await call('creatureFolders.initiative.advance', { folderId, step: 1 });
      const tracker = await withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId })).initiative);
      if (tracker.round !== 1 || tracker.turn !== 0) throw new Error(`round ${tracker.round}, turn ${tracker.turn}`);
      options = await withDb(db => db.collection('creatureProperties').find({
        'root.id': dragonId, type: 'action', removed: { $ne: true }, 'resources.attributesConsumed.variableName': 'legendaryActions',
      }, { projection: { name: 1 }, sort: { left: 1 } }).toArray());
      if (options.length !== 3) throw new Error(`the dragon's legendary actions: ${options.map(option => option.name).join(', ')}`);
      return `${dragonName}: ${options.map(option => option.name).join(', ')}`;
    });

    await step('the game master\'s tracker shows "3/3"; the player\'s nothing of them', gm.messages, async () => {
      await visit(gm.page, `/party/${folderId}`, 5000);
      await removeOverlay(gm.page);
      const chip = await waitFor(async () => {
        const text = await chipText(gm.page, entryId).catch(() => '');
        return text === '3/3' && text;
      }, 'the dragon\'s legendary actions on the tracker');
      await visit(player.page, `/party/${folderId}`, 5000);
      await removeOverlay(player.page);
      await player.page.waitForSelector(`[data-id="initiative-entry-${entryId}"]`, { timeout: 15000 });
      if (await player.page.locator('[data-id^="initiative-legendary-"]').count()) throw new Error('the player sees the legendary actions');
      return `game master: ${chip}`;
    });

    await step('on the character\'s turn: the options and their cost; the Tail Attack at the character, picked: "2/3"', gm.messages, async () => {
      await gm.page.locator(`[data-id="initiative-legendary-${entryId}"]`).click();
      const menu = gm.page.locator(`[data-id="initiative-legendary-menu-${entryId}"]`);
      await menu.waitFor({ timeout: 10000 });
      const listed = (await menu.innerText()).replace(/\s+/g, ' ');
      for (const expected of ['Detect', 'Tail Attack', 'Wing Attack', 'Costs 1 action', 'Costs 2 actions']) {
        if (!listed.includes(expected)) throw new Error(`the menu reads "${listed}"`);
      }
      if (await gm.page.locator(`[data-id="initiative-legendary-own-turn-${entryId}"]`).count()) {
        throw new Error('the menu says it is the dragon\'s turn');
      }
      const tail = options.find(option => option.name === 'Tail Attack');
      await gm.page.locator(`[data-id="initiative-legendary-option-${tail._id}"]`).click();
      // During the fight, the picker by itself
      await gm.page.waitForSelector(`[data-id="target-option-${characterId}"]`, { timeout: 20000 });
      await gm.page.waitForTimeout(500);
      await gm.page.locator(`[data-id="target-option-${characterId}"] input`).check();
      const before = (await latestReceived(characterId, dragonId))?._id;
      await gm.page.locator('[data-id="target-picker-confirm"]').click();
      // The attack's advantage, in the action's dialog that took the picker's place
      await gm.page.waitForSelector('.dialog-stack .action-dialog', { timeout: 15000 });
      await gm.page.waitForTimeout(1500);
      await gm.page.locator('.dialog-stack #roll-hex').first().click();
      await gm.page.locator('.dialog-stack .done-button').first().click({ timeout: 15000 });
      const log = await waitFor(async () => {
        const latest = await latestReceived(characterId, dragonId);
        return latest && latest._id !== before && latest;
      }, 'the character\'s entry');
      const names = log.content.map(line => line.name);
      if (names[0] !== `${dragonName} → you` || !names.includes('Tail Attack')) throw new Error(`its lines: ${names.join(' · ')}`);
      await waitFor(async () => !await dialogs(gm.page).count(), 'the dialogs to close');
      await waitFor(async () => await chipText(gm.page, entryId) === '2/3', 'the tracker to read 2/3');
      return names.join(' · ');
    });

    await step(`the player's spell at the dragon: "${DRAGON} · Failed → success (legendary resistance)", without its roll`, player.messages, async () => {
      const holdId = characterPropIds[2];
      await visit(player.page, `/character/${characterId}`, 5000);
      await removeOverlay(player.page);
      await showTab(player.page, characterId, 'actions');
      await player.page.waitForTimeout(1500);
      await player.page.locator(`[data-id="${holdId}-target-button"]`).first().click();
      await player.page.waitForSelector(`[data-id="target-option-${dragonId}"]`, { timeout: 15000 });
      await player.page.waitForTimeout(500);
      await player.page.locator(`[data-id="target-option-${dragonId}"] input`).check();
      const started = new Date();
      await player.page.locator('[data-id="target-picker-confirm"]').click();
      const log = await waitFor(() => ownEntry(characterId, 'E2E Hold Monster', started), 'the character\'s entry');
      const save = log.content.find(line => line.name === `${dragonName} · Failed → success (legendary resistance)`);
      if (!save || save.value) throw new Error(`the saving throw's line: ${JSON.stringify(log.content.map(line => [line.name, line.value]))}`);
      const names = log.content.map(line => line.name);
      if (!names.includes('E2E Shrugged off') || names.includes('E2E Held')) throw new Error(`its lines: ${names.join(' · ')}`);
      const text = JSON.stringify(log.content);
      if (/1d20|Legendary Resistance|logs\.attributeDamaged/.test(text)) throw new Error(`the dragon's roll or resource: ${text.slice(0, 300)}`);
      const resistance = await prop({ 'root.id': dragonId, variableName: 'legendaryResistance' }, { damage: 1 });
      if (resistance?.damage !== 1) throw new Error(`the dragon's legendary resistances spent: ${resistance?.damage}`);
      await waitFor(async () => !await dialogs(player.page).count(), 'the dialogs to close');
      // The player's board says it the same way
      return names.join(' · ');
    });

    let roll;
    await step('the breath spent, Next starts the dragon\'s turn: its log rolls the recharge, back on 5-6 only; "3/3" again', gm.messages, async () => {
      // As the game master's −1 on the breath's resource, on the dragon's sheet
      const charge = await prop({ 'root.id': dragonId, variableName: 'fireBreathCharge' }, { _id: 1 });
      const actionId = await call('actions.insertAction', {
        action: {
          creatureId: dragonId, results: [], taskCount: 0,
          task: { subtaskFn: 'damageProp', targetIds: [dragonId], params: { operation: 'increment', value: 1, targetProp: { _id: charge._id } } },
        },
      });
      await call('actions.runAction', { actionId, decisions: [] });
      await waitFor(async () => (await prop({ _id: charge._id }, { value: 1 }))?.value === 0, 'the breath spent');
      const since = new Date();
      await gm.page.click('[data-id="initiative-next"]');
      const log = await waitFor(() => withDb(db => db.collection('creatureLogs').findOne(
        { creatureId: dragonId, date: { $gte: since }, 'content.name': 'Start of turn' },
      )), 'the dragon\'s turn to start');
      const names = log.content.filter(line => !line.silenced).map(line => line.name);
      if (names[0] !== 'Start of turn' || !names.includes('Recharge: Fire Breath') || !names.includes('Recharge roll')) {
        throw new Error(`the dragon's entry: ${names.join(' · ')}`);
      }
      const rolled = log.content.find(line => line.name === 'Recharge roll');
      roll = Number(/\*\*(\d+)\*\*\s*$/.exec(rolled?.value || '')?.[1]);
      if (!(roll >= 1 && roll <= 6)) throw new Error(`the roll: ${JSON.stringify(rolled)}`);
      const back = await waitFor(async () => {
        const value = (await prop({ _id: charge._id }, { value: 1 }))?.value;
        return value !== undefined && { value };
      }, 'the breath\'s resource');
      if ((back.value === 1) !== (roll >= 5)) throw new Error(`rolled ${roll}, the breath reads ${back.value}`);
      await waitFor(async () => await chipText(gm.page, entryId) === '3/3', 'the tracker to read 3/3 again');
      return `${names.join(' · ')}: rolled ${roll}, breath ${back.value ? 'back' : 'still spent'}`;
    });

    await step('on the dragon\'s own turn, its menu says so', gm.messages, async () => {
      await gm.page.locator(`[data-id="initiative-legendary-${entryId}"]`).click();
      const note = gm.page.locator(`[data-id="initiative-legendary-own-turn-${entryId}"]`);
      await note.waitFor({ timeout: 10000 });
      const text = (await note.innerText()).replace(/\s+/g, ' ').trim();
      if (!text.includes(dragonName)) throw new Error(`the note reads "${text}"`);
      await gm.page.keyboard.press('Escape');
      await gm.page.waitForTimeout(500);
      return text;
    });
  } finally {
    // Put everything back, through the app
    try {
      for (const _id of characterPropIds) await (callAsPlayer || call)('creatureProperties.softRemove', { _id });
      if (dragonId) await call('creatureFolders.monsters.endEncounter', { folderId, endCombat: true });
      if (folderId) {
        if (!callAsPlayer) {
          player = await openPage({ username: OTHER });
          browsers.push(player.browser);
          callAsPlayer = caller(player.page);
        }
        await visit(player.page, '/character-list', 2000);
        await callAsPlayer('creatureFolders.party.leave', { folderId });
        await call('creatureFolders.methods.remove', { _id: folderId });
      }
      if (!alreadyFollowed) await call('users.subscribeToLibrary', { libraryId: data.bestiary._id, subscribe: false });
    } finally {
      for (const browser of browsers) await browser.close().catch(() => {});
    }
  }
  finish();
});
