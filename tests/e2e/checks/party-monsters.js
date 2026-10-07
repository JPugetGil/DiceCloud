#!/usr/bin/env node
/**
 * Monsters on a party board, as its game master and as one of its players.
 * The test account follows the SRD 5.1 bestiary (English), makes a board that
 * the other test account joins with its character, and adds two goblins from
 * the board's bestiary picker. The game master's cards show the goblins' hit
 * points, and the card and the sheet their bestiary's licence; the player's
 * show their names and the condition one is under, and
 * neither hit points nor the initiative roll of a goblin. The end of the
 * encounter deletes them. Everything is put back at the end: the board, the
 * monsters and the library subscription.
 */
const { default: AxeBuilder } = require('@axe-core/playwright');
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

// axe-core's WCAG 2.1 A and AA violations on the page, as the accessibility check reports them
async function audit(page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => `${v.id}: ${(n.target || []).join(' ').slice(-70)}`));
}

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
  const { step, finish } = createChecker('Monsters on a party board');
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

  const gm = await openPage();
  const call = caller(gm.page);
  const browsers = [gm.browser];
  let folderId;
  let goblinIds = [];
  try {
    await step('the game master follows the bestiary and opens a board a player joins', gm.messages, async () => {
      await visit(gm.page, '/character-list', 3000);
      if (!alreadyFollowed) await call('users.subscribeToLibrary', { libraryId: data.bestiary._id, subscribe: true });
      folderId = await call('creatureFolders.methods.insert', {});
      await call('creatureFolders.methods.updateName', { _id: folderId, name: 'E2E ambush' });
      const token = await call('creatureFolders.party.createInvite', { folderId });
      const player = await openPage({ username: OTHER });
      browsers.push(player.browser);
      await visit(player.page, '/character-list', 3000);
      await caller(player.page)('creatureFolders.party.join', { token, creatureIds: [data.character._id] });
      await player.browser.close();
    });

    await step('the game master adds two goblins from the bestiary picker', gm.messages, async () => {
      await visit(gm.page, `/party/${folderId}`, 4000);
      await removeOverlay(gm.page);
      await gm.page.click('[data-id="party-add-monsters"]');
      await gm.page.waitForSelector('[data-id="monster-search"] input', { timeout: 20000 });
      await gm.page.waitForSelector('[data-id^="monster-option-"]', { timeout: 20000 });
      await gm.page.fill('[data-id="monster-search"] input', 'goblin');
      await gm.page.waitForSelector(`[data-id="monster-option-${data.goblin._id}"]`, { timeout: 10000 });
      await gm.page.click(`[data-id="monster-option-${data.goblin._id}"]`);
      await gm.page.fill('[data-id="monster-count"] input', '2');
      await gm.page.click('[data-id="monster-add"]');
      await gm.page.waitForFunction(() => document.querySelectorAll('[data-monster]').length === 2, null, { timeout: 30000 });
      goblinIds = await withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId })).creatures
        .filter(id => id !== data.character._id));
      if (goblinIds.length !== 2) throw new Error(`${goblinIds.length} monsters on the board`);
      return (await gm.page.textContent('[data-id="party-monster-count"]')).trim();
    });

    await step('their cards show the game master their hit points, challenge rating and type', gm.messages, async () => {
      await gm.page.waitForTimeout(1500);
      const texts = await gm.page.$$eval('[data-monster]', cards => cards.map(card => card.innerText.replace(/\s+/g, ' ')));
      for (const text of texts) {
        if (!/Goblin \d/.test(text)) throw new Error(`a card reads "${text.slice(0, 80)}"`);
        if (!/Hit Points \d+ \/ \d+/.test(text)) throw new Error(`no hit points on "${text.slice(0, 80)}"`);
        if (!text.includes('CR 1/4') || !text.includes('humanoid')) throw new Error(`no type line on "${text.slice(0, 80)}"`);
      }
      const characters = (await gm.page.textContent('[data-id="party-character-count"]')).trim();
      if (!characters.startsWith('1 ')) throw new Error(`the party counts "${characters}": monsters are not characters`);
      const violations = await audit(gm.page);
      if (violations.length) throw Object.assign(new Error(`${violations.length} accessibility violation(s)`), { details: violations });
      return texts[0].slice(0, 90);
    });

    await step('their card and sheet name their bestiary\'s licence, linked to the About page', gm.messages, async () => {
      const footer = selector => gm.page.evaluate(selector => {
        const el = document.querySelector(selector);
        return el && { text: el.innerText.trim(), href: el.querySelector('a')?.getAttribute('href') };
      }, selector);
      const expected = JSON.stringify({ text: 'SRD 5.1 · CC BY 4.0', href: '/about#licenses' });
      const onCard = await footer(`[data-id="party-member-${goblinIds[0]}"] [data-id="monster-license"]`);
      if (JSON.stringify(onCard) !== expected) throw new Error(`the card's licence: ${JSON.stringify(onCard)}`);
      await visit(gm.page, `/character/${goblinIds[0]}`, 5000);
      await removeOverlay(gm.page);
      const onSheet = await footer('[data-id="monster-license"]');
      if (JSON.stringify(onSheet) !== expected) throw new Error(`the sheet's licence: ${JSON.stringify(onSheet)}`);
      await visit(gm.page, `/party/${folderId}`, 4000);
      await removeOverlay(gm.page);
    });

    await step('a goblin falls prone, and the fight starts', gm.messages, async () => {
      await call('creatureProperties.insert', {
        creatureProperty: { type: 'buff', name: 'Prone', tags: ['condition', 'proneCondition'] },
        parentRef: { collection: 'creatures', id: goblinIds[0] },
      });
      await gm.page.click('[data-id="initiative-roll"]');
      await gm.page.waitForSelector('[data-id="initiative-round"]', { timeout: 15000 });
    });

    await step(`${OTHER} sees the goblins' names and condition, and no hit points nor roll of theirs`, null, async () => {
      const player = await openPage({ username: OTHER });
      browsers.push(player.browser);
      await visit(player.page, `/party/${folderId}`, 6000);
      await removeOverlay(player.page);
      const result = await player.page.evaluate(({ goblinIds, characterId }) => {
        const cards = goblinIds.map(id => document.querySelector(`[data-id="party-member-${id}"]`));
        const tracker = id => [...document.querySelectorAll('[data-id^="initiative-entry-"]')]
          .find(row => row.innerText.includes(id === characterId ? 'E2E' : 'Goblin'));
        return {
          found: cards.filter(Boolean).length,
          texts: cards.map(card => card?.innerText.replace(/\s+/g, ' ') || ''),
          summaries: cards.map(card => card?.querySelectorAll('[data-id^="combat-summary"], [data-id="monster-license"]').length || 0),
          goblinRow: tracker(goblinIds[0])?.innerText.replace(/\s+/g, ' '),
          heroRow: tracker(characterId)?.innerText.replace(/\s+/g, ' '),
        };
      }, { goblinIds, characterId: data.character._id });
      if (result.found !== 2) throw new Error(`${result.found} goblin cards`);
      if (!result.texts[0].includes('Prone')) throw new Error(`no condition on "${result.texts[0]}"`);
      for (const [i, text] of result.texts.entries()) {
        if (/Hit Points|\d+ \/ \d+|AC|CR /.test(text) || result.summaries[i]) {
          throw new Error(`a goblin's card shows its stats: "${text}"`);
        }
      }
      if (!result.goblinRow || /d20/.test(result.goblinRow)) throw new Error(`a goblin's row reads "${result.goblinRow}"`);
      if (!result.heroRow || !/d20/.test(result.heroRow)) throw new Error(`the hero's row reads "${result.heroRow}"`);
      const violations = await audit(player.page);
      if (violations.length) throw Object.assign(new Error(`${violations.length} accessibility violation(s)`), { details: violations });
      await player.browser.close();
      if (player.messages.length) throw new Error(player.messages[0]);
      return `${result.texts[0]} · tracker: ${result.goblinRow}`;
    });

    await step('the end of the encounter deletes the goblins and ends the fight', gm.messages, async () => {
      await gm.page.click('[data-id="party-end-encounter"]');
      await gm.page.click('[data-id="party-end-encounter-confirm"]');
      await gm.page.waitForFunction(() => !document.querySelector('[data-monster]'), null, { timeout: 20000 });
      await gm.page.waitForFunction(() => !document.querySelector('[data-id="initiative-round"]'), null, { timeout: 10000 });
      const left = await withDb(db => db.collection('creatures').countDocuments({ _id: { $in: goblinIds } }));
      if (left) throw new Error(`${left} goblins left in the database`);
      goblinIds = [];
    });
  } finally {
    // Put everything back, through the app
    try {
      if (goblinIds.length) await call('creatureFolders.monsters.endEncounter', { folderId, endCombat: true });
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
