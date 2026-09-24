#!/usr/bin/env node
/**
 * Drives the character sheet like a user: every tab, the speed dial, creating a
 * property, opening and editing it, then the library and character list pages.
 * The property it creates is removed again at the end.
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
  await step('health bar spans the row (label left, bar filling the rest)', messages, async () => {
    // Vue 2 gave the bar flex-grow 100 against the label's 1; Vuetify 3's
    // !important flex-1-1 once split the row in half
    const r = await page.evaluate(() => {
      const bar = document.querySelector('.health-bar');
      if (!bar) return null;
      const name = bar.querySelector('.name').getBoundingClientRect();
      const track = bar.querySelector('.name').nextElementSibling.getBoundingClientRect();
      return { name: Math.round(name.width), track: Math.round(track.width), row: Math.round(bar.getBoundingClientRect().width) };
    });
    if (!r) throw new Error('no health bar on the character (run "npm run setup")');
    if (r.track < r.row * 0.75) throw new Error(`the bar is ${r.track} of ${r.row} px, the label ${r.name} px`);
    return `bar ${r.track} of ${r.row} px, label ${r.name} px`;
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
  await step('library page', messages, () => visit(page, '/library', 3000));
  await step('character list', messages, () => visit(page, '/character-list', 2500));
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
