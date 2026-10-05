#!/usr/bin/env node
/**
 * Drives the character sheet like a user: every tab, the speed dial, creating a
 * property, opening and editing it, giving a condition and taking it away, then
 * the library and character list pages. The property it creates is removed
 * again at the end.
 */
const { openPage, visit } = require('../lib/browser');
const { withDb, getTestUser } = require('../lib/db');
const { createChecker, main } = require('../lib/check');

main(async () => {
  const { creatureId } = await getTestUser();
  const { browser, page, messages } = await openPage();
  const { step, finish } = createChecker('Flows: character sheet and property editing');
  const name = `E2E flow ${Date.now().toString(36)}`;

  await step('character sheet loads', messages, async () => {
    await visit(page, `/character/${creatureId}`, 0);
    await page.waitForSelector('.character-sheet-toolbar', { timeout: 60000 });
    await page.waitForTimeout(3500);
  });
  await step('the combat summary leads with the hit points, their bar under them', messages, async () => {
    // The character's hit points head the Stats tab (D1): the value, then a
    // bar as wide as its block, which Vuetify's flex utilities once halved
    const r = await page.evaluate(() => {
      const value = document.querySelector('[data-id="combat-summary-hp"]');
      if (!value) return null;
      const block = value.parentElement.getBoundingClientRect();
      const bar = value.parentElement.querySelector('.bar').getBoundingClientRect();
      return { text: value.textContent.replace(/\s+/g, ' ').trim(), bar: Math.round(bar.width), block: Math.round(block.width) };
    });
    if (!r) throw new Error('no hit points in the combat summary (run "npm run setup")');
    if (!/\d+ \/ \d+/.test(r.text)) throw new Error(`hit points read "${r.text}"`);
    if (r.bar < r.block * 0.9) throw new Error(`the bar is ${r.bar} of ${r.block} px`);
    return `${r.text}, bar ${r.bar} of ${r.block} px`;
  });
  for (const tab of ['Actions', 'Spells', 'Inventory', 'Features', 'Journal', 'Build', 'Stats']) {
    await step(`tab ${tab}`, messages, async () => {
      await page.locator('.v-tab', { hasText: tab }).first().click();
      await page.waitForTimeout(1200);
    });
  }
  await step('speed dial opens the insert dialog', messages, async () => {
    await page.locator('[data-id="insert-creature-property-fab"]').first().click();
    await page.waitForSelector('[data-id="insert-creature-property-type-attribute"]', { timeout: 8000 });
    await page.locator('[data-id="insert-creature-property-type-attribute"]').click();
    await page.waitForSelector('.dialog-stack .creature-property-form', { timeout: 10000 });
    await page.waitForTimeout(1200);
    await page.locator('.dialog-stack .v-input', { hasText: 'Name' }).locator('input').first().fill(name);
    await page.waitForTimeout(1200);
  });
  await step('create a property', messages, async () => {
    await page.getByRole('button', { name: /^create$/i }).last().click();
    await page.waitForTimeout(3500);
    if (!await page.locator('.character-sheet', { hasText: name }).count()) throw new Error('property not shown');
  });
  await step('open and edit the property', messages, async () => {
    await page.locator('.v-card', { hasText: name }).first().click();
    await page.waitForSelector('.dialog-stack .v-toolbar', { timeout: 10000 });
    await page.waitForTimeout(1500);
    const dialog = page.locator('.dialog-transition-group > *').last();
    await dialog.getByRole('button', { name: /^edit$/i }).first().click();
    await page.waitForTimeout(1500);
    await dialog.locator('.v-input', { hasText: 'Name' }).locator('input').first().fill(`${name} edited`);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(2500);
    const title = await dialog.locator('.v-toolbar-title').first().innerText();
    if (!title.includes('edited')) throw new Error(`the edit did not persist: ${title}`);
    await dialog.getByRole('button', { name: /^close$/i }).first().click();
    await page.waitForTimeout(2000);
    const open = await page.locator('.dialog-transition-group > *').count();
    if (open) throw new Error(`${open} dialog(s) left open`);
  });
  await step('the character search finds the property and opens it', messages, async () => {
    await page.locator('[data-id="character-search"]').first().click();
    await page.waitForSelector('[data-id="character-search-input"] input', { timeout: 10000 });
    await page.locator('[data-id="character-search-input"] input').fill(`${name} edited`.toUpperCase());
    await page.waitForTimeout(800);
    const result = page.locator('[data-id="character-search-results"] .v-list-item', { hasText: name }).first();
    if (!await result.count()) throw new Error('the property is not among the results');
    await result.click();
    await page.waitForTimeout(1500);
    const dialog = page.locator('.dialog-transition-group > *').last();
    const title = await dialog.locator('.v-toolbar-title').first().innerText();
    if (!title.includes(name)) throw new Error(`opened ${title}`);
    // Back to the search, then back to the sheet
    await dialog.getByRole('button', { name: /^close$/i }).first().click();
    await page.waitForTimeout(1200);
    await page.locator('.dialog-transition-group > *').last().locator('.base-dialog-toolbar .v-btn').first().click();
    await page.waitForTimeout(1200);
    const open = await page.locator('.dialog-transition-group > *').count();
    if (open) throw new Error(`${open} dialog(s) left open`);
  });
  await step('a condition chip gives the condition, then takes it away', messages, async () => {
    const chip = page.locator('[data-id="condition-chips"] .v-chip[aria-pressed="false"]').first();
    if (!await chip.count()) return 'skipped: the character\'s libraries hold no condition';
    const id = await chip.getAttribute('data-id');
    const condition = (await chip.innerText()).trim();
    const pressed = () => page.locator(`[data-id="${id}"]`).getAttribute('aria-pressed');
    const listed = () => page.locator('.stats-tab .buffs .v-list-item', { hasText: condition }).count();
    const waitFor = async (test, what) => {
      for (let i = 0; i < 20 && !await test(); i++) await page.waitForTimeout(500);
      if (!await test()) throw new Error(what);
    };
    await chip.click();
    await waitFor(async () => await pressed() === 'true' && await listed() > 0, `${condition} was not given`);
    await page.locator(`[data-id="${id}"]`).click();
    await waitFor(async () => await pressed() === 'false' && await listed() === 0, `${condition} was not taken away`);
    return condition;
  });
  await step('library page', messages, () => visit(page, '/library', 3000));
  await step('character list', messages, () => visit(page, '/character-list', 2500));
  await step('the character list finds the character by its name', messages, async () => {
    const { name: characterName } = await withDb(db => db.collection('creatures').findOne({ _id: creatureId }, { projection: { name: 1 } }));
    const search = page.locator('[data-id="character-list-search"] input');
    const card = page.locator(`[data-id="character-card-${creatureId}"]`);
    await search.fill(characterName.toLowerCase());
    await page.waitForTimeout(500);
    if (!await card.count()) throw new Error(`no card for ${characterName}`);
    await search.fill(`${characterName} no such character`);
    await page.waitForTimeout(500);
    if (await card.count()) throw new Error('the card shows for a search it does not match');
  });
  await step('clean up the created property', messages, async () => {
    const ids = await withDb(db => db.collection('creatureProperties')
      .find({ 'root.id': creatureId, name: { $regex: `^${name}` }, removed: { $ne: true } })
      .map(p => p._id).toArray());
    for (const _id of ids) {
      await page.evaluate(_id => window.Meteor.callAsync('creatureProperties.softRemove', { _id }), _id);
    }
  });

  await browser.close();
  finish();
});
