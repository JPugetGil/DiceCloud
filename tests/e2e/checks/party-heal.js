#!/usr/bin/env node
/**
 * A player acts on another player's character of their party (phase 2.2):
 * the test account makes a board with its own character, which the other
 * test account joins with its character; the board holds a goblin of the SRD
 * 5.1 bestiary too. The player's healing action ("Target…") offers the game
 * master's character, never the goblin; picked, its hit points go up and its
 * log says "<the player's character> → you", with the healing and its hit
 * points. The board's "Target" is on the game master's character for the
 * player, not on the goblin. The server refuses a rest, damage typed in, and
 * the goblin. Removed from the party while an attack's dialog is open, the
 * player sees the refusal when they roll, and nothing is applied. Everything
 * is put back.
 */
const { openPage, visit } = require('../lib/browser');
const { withDb, getTestUser } = require('../lib/db');
const { USERNAME } = require('../lib/config');
const { createChecker, main } = require('../lib/check');

const OTHER = `${USERNAME}-other`;
const BESTIARY = 'SRD 5.1 Bestiary';
const DENIED = 'You may not target this creature with this action';
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
const damageOf = propId => withDb(async db => (await db.collection('creatureProperties').findOne({ _id: propId }))?.damage || 0);

main(async () => {
  const { creatureId: gmCharacterId } = await getTestUser();
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
    const gmCharacter = await db.collection('creatures').findOne({ _id: gmCharacterId }, { projection: { name: 1 } });
    // The game master's character's folder, if it is in one: put back at the end
    const homeFolder = await db.collection('creatureFolders').findOne(
      { owner: gm?._id, creatures: gmCharacterId }, { projection: { _id: 1 } },
    );
    return { gm, player, bestiary, goblin, character, gmCharacter, homeFolderId: homeFolder?._id };
  });
  const { step, finish } = createChecker('Party targeting: a player heals another player\'s character');
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
  const characterName = data.character.name;

  const gm = await openPage();
  const call = caller(gm.page);
  const browsers = [gm.browser];
  let player;
  let callAsPlayer;
  let folderId;
  let goblinId;
  let gmHitPointsId;
  // What the check gives each character, then takes back, by owner
  const gmPropIds = [];
  const playerPropIds = [];
  let cureId;
  let jabId;
  try {
    await step('a board with both players\' characters and a goblin', gm.messages, async () => {
      await visit(gm.page, '/character-list', 3000);
      if (!alreadyFollowed) await call('users.subscribeToLibrary', { libraryId: data.bestiary._id, subscribe: true });
      folderId = await call('creatureFolders.methods.insert', {});
      await call('creatureFolders.methods.updateName', { _id: folderId, name: 'E2E healing' });
      await call('creatureFolders.methods.moveCreatureToFolder', { creatureId: gmCharacterId, folderId });
      const token = await call('creatureFolders.party.createInvite', { folderId });
      player = await openPage({ username: OTHER });
      browsers.push(player.browser);
      callAsPlayer = caller(player.page);
      await visit(player.page, '/character-list', 3000);
      await callAsPlayer('creatureFolders.party.join', { token, creatureIds: [characterId] });
      await call('creatureFolders.monsters.add', { folderId, nodeId: data.goblin._id, count: 1 });
      goblinId = await withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId })).creatures
        .find(id => id !== characterId && id !== gmCharacterId));
      if (!goblinId) throw new Error('no goblin on the board');
      // Hit points for the game master's character, hurt by 20, and an
      // armor class the player's jab hits
      gmHitPointsId = await call('creatureProperties.insert', {
        creatureProperty: {
          type: 'attribute', attributeType: 'healthBar', name: 'E2E Hit Points', variableName: 'hitPoints',
          baseValue: { calculation: '200' },
        },
        parentRef: { collection: 'creatures', id: gmCharacterId },
      });
      gmPropIds.push(gmHitPointsId);
      gmPropIds.push(await call('creatureProperties.insert', {
        creatureProperty: { type: 'attribute', attributeType: 'stat', name: 'E2E Armor Class', variableName: 'armor', baseValue: { calculation: '5' } },
        parentRef: { collection: 'creatures', id: gmCharacterId },
      }));
      // The server computes the creatures someone has open: its sheet
      await visit(gm.page, `/character/${gmCharacterId}`, 3000);
      await waitFor(() => withDb(async db => (await db.collection('creatureProperties').findOne({ _id: gmHitPointsId }))?.total === 200),
        'the hit points computed');
      const hurtId = await call('actions.insertAction', {
        action: {
          creatureId: gmCharacterId, task: { subtaskFn: 'dealDamage', targetIds: [gmCharacterId], params: { amount: 20 } },
          results: [], taskCount: 0,
        },
      });
      await call('actions.runAction', { actionId: hurtId, decisions: [] });
      if (await damageOf(gmHitPointsId) !== 20) throw new Error(`hurt by ${await damageOf(gmHitPointsId)}, not 20`);
      // The player's character heals, with dice, and jabs
      cureId = await callAsPlayer('creatureProperties.insert', {
        creatureProperty: { type: 'action', name: 'E2E Cure', target: 'singleTarget' },
        parentRef: { collection: 'creatures', id: characterId },
      });
      playerPropIds.push(cureId);
      await callAsPlayer('creatureProperties.insert', {
        creatureProperty: { type: 'damage', target: 'target', damageType: 'healing', amount: { calculation: '1d4 + 5' } },
        parentRef: { collection: 'creatureProperties', id: cureId },
      });
      jabId = await callAsPlayer('creatureProperties.insert', {
        creatureProperty: { type: 'action', name: 'E2E Jab', target: 'singleTarget', attackRoll: { calculation: '5' } },
        parentRef: { collection: 'creatures', id: characterId },
      });
      playerPropIds.push(jabId);
      return `${data.gmCharacter?.name} (the game master's), ${characterName} (the player's)`;
    });

    await step('the player\'s "Target…" offers the game master\'s character, never the goblin', player.messages, async () => {
      await visit(player.page, `/character/${characterId}`, 5000);
      await removeOverlay(player.page);
      await showTab(player.page, characterId, 'actions');
      await player.page.waitForTimeout(1500);
      await player.page.locator(`[data-id="${cureId}-target-button"]`).first().click();
      await player.page.waitForSelector('[data-id="target-picker-dialog"]', { timeout: 15000 });
      await player.page.waitForSelector(`[data-id="target-option-${gmCharacterId}"]`, { timeout: 15000 });
      await player.page.waitForTimeout(500);
      const offered = await player.page.locator('[data-id^="target-option-"]').evaluateAll(
        options => options.map(option => option.getAttribute('data-id')),
      );
      for (const id of ['none', characterId, gmCharacterId]) {
        if (!offered.includes(`target-option-${id}`)) throw new Error(`not offered: ${id} (${offered.join(', ')})`);
      }
      if (offered.includes(`target-option-${goblinId}`)) throw new Error('the goblin is offered to a player');
      return `${offered.length - 1} creatures offered`;
    });

    await step('picked, the game master\'s character is healed: its log says "<the player\'s character> → you"', player.messages, async () => {
      await player.page.locator(`[data-id="target-option-${gmCharacterId}"] input`).check();
      // A run before this one left its entry
      const before = (await latestReceived(gmCharacterId, characterId))?._id;
      await player.page.locator('[data-id="target-picker-confirm"]').click();
      const log = await waitFor(async () => {
        const latest = await latestReceived(gmCharacterId, characterId);
        return latest && latest._id !== before && latest;
      }, 'the game master\'s character\'s entry');
      const names = log.content.map(line => line.name);
      if (names[0] !== `${characterName} → you`) throw new Error(`its heading: ${names[0]}`);
      // The healing's roll, whole (another player's character hides nothing),
      // and the hit points it gave back
      const healing = log.content.find(line => line.name === 'Healing');
      if (!/1d4/.test(healing?.value || '')) throw new Error(`the healing's line: ${JSON.stringify(healing)}`);
      const restored = log.content.find(line => /^\+\d+ E2E Hit Points$/.test(line.value || ''));
      const healed = Number(/^\+(\d+)/.exec(restored?.value || '')?.[1]);
      if (!(healed >= 6 && healed <= 9)) throw new Error(`the hit points' line: ${JSON.stringify(restored)}`);
      const damage = await waitFor(async () => {
        const left = await damageOf(gmHitPointsId);
        return left !== 20 && { left };
      }, 'the hit points to go up');
      if (damage.left !== 20 - healed) throw new Error(`damage ${damage.left}, not ${20 - healed}`);
      await waitFor(async () => !await dialogs(player.page).count(), 'the picker to close');
      return `${names[0]} · Healing ${healing.value.split('\n')[0]} · +${healed} E2E Hit Points`;
    });

    await step('the game master reads it on their character\'s sheet', gm.messages, async () => {
      await visit(gm.page, `/character/${gmCharacterId}`, 6000);
      await removeOverlay(gm.page);
      const log = await waitFor(async () => {
        const shown = await gm.page.evaluate(() => document.querySelector('.character-log')?.innerText || '');
        return shown.includes(`${characterName} → you`) && shown;
      }, 'the entry in the log', 10000);
      if (!/E2E Hit Points/.test(log)) throw new Error(`the log reads "${log.replace(/\s+/g, ' ').slice(0, 200)}"`);
    });

    await step('on the board, the player may "Target" the game master\'s character, not the goblin', player.messages, async () => {
      await visit(player.page, `/party/${folderId}`, 5000);
      await removeOverlay(player.page);
      await player.page.waitForSelector(`[data-id="party-target-${gmCharacterId}"]`, { timeout: 15000 });
      if (await player.page.locator(`[data-id="party-target-${goblinId}"]`).count()) {
        throw new Error('"Target" on the goblin\'s card');
      }
    });

    await step('the server refuses a rest and damage typed in on that character, and the goblin', null, async () => {
      const attempts = {
        'a rest': { subtaskFn: 'reset', targetIds: [gmCharacterId], eventName: 'longRest' },
        'damage typed in': { subtaskFn: 'dealDamage', targetIds: [gmCharacterId], params: { amount: 50 } },
        'the goblin': { prop: { _id: cureId }, targetIds: [goblinId] },
      };
      const refused = [];
      for (const [what, task] of Object.entries(attempts)) {
        const reason = await refusalOf(player.page, 'actions.insertAction', {
          action: { creatureId: characterId, task, results: [], taskCount: 0 },
        });
        if (reason !== DENIED) throw new Error(`${what}: ${reason === null ? 'accepted' : reason}`);
        refused.push(what);
        await pause(300);
      }
      return `refused: ${refused.join(', ')}`;
    });

    await step('removed from the party with an attack\'s dialog open, the player sees the refusal as they roll', null, async () => {
      await visit(player.page, `/character/${characterId}`, 5000);
      await removeOverlay(player.page);
      await showTab(player.page, characterId, 'actions');
      await player.page.waitForTimeout(1500);
      await player.page.locator(`[data-id="${jabId}-target-button"]`).first().click();
      await player.page.waitForSelector(`[data-id="target-option-${gmCharacterId}"]`, { timeout: 15000 });
      await player.page.locator(`[data-id="target-option-${gmCharacterId}"] input`).check();
      await player.page.locator('[data-id="target-picker-confirm"]').click();
      // The attack's advantage, in the action's dialog that took the picker's place
      await player.page.waitForSelector('.dialog-stack .action-dialog', { timeout: 15000 });
      await player.page.waitForTimeout(1500);
      const before = (await latestReceived(gmCharacterId, characterId))?._id;
      await call('creatureFolders.party.removeMember', { folderId, userId: data.player._id });
      await player.page.locator('.dialog-stack #roll-hex').first().click();
      const shown = await waitFor(async () => {
        const text = await player.page.evaluate(() => [...document.querySelectorAll('.v-snackbar')].map(bar => bar.innerText).join(' '));
        return text.includes(DENIED) && text;
      }, 'the refusal', 10000);
      if ((await latestReceived(gmCharacterId, characterId))?._id !== before) throw new Error('applied all the same');
      await popDialog(player.page);
      return shown.replace(/\s+/g, ' ').trim();
    });
  } finally {
    // Put everything back, through the app
    try {
      for (const _id of gmPropIds) await call('creatureProperties.softRemove', { _id });
      for (const _id of playerPropIds) await callAsPlayer?.('creatureProperties.softRemove', { _id });
      if (goblinId) await call('creatureFolders.monsters.endEncounter', { folderId, endCombat: true });
      if (folderId) {
        if (callAsPlayer) await callAsPlayer('creatureFolders.party.leave', { folderId });
        await call('creatureFolders.methods.moveCreatureToFolder', { creatureId: gmCharacterId, folderId: data.homeFolderId ?? null });
        await call('creatureFolders.methods.remove', { _id: folderId });
      }
      if (!alreadyFollowed) await call('users.subscribeToLibrary', { libraryId: data.bestiary._id, subscribe: false });
    } finally {
      for (const browser of browsers) await browser.close().catch(() => {});
    }
  }
  finish();
});
