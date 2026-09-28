#!/usr/bin/env node
/**
 * Action targets: an action may target the acting character (rests, attribute
 * and skill buttons do), but never a character the user cannot edit. Before
 * tabletops were removed, the server only compared tabletop ids, which are
 * both empty outside a tabletop, so any character id was accepted. Also runs a
 * skill check through its dialog (it once failed as it opened, and its result
 * preview kept only the first line) and the Short rest button end to end, and
 * checks that no log entry is cut off (Vuetify 3's cards shrank in the log).
 */
const { openPage, visit } = require('../lib/browser');
const { withDb, getTestUser } = require('../lib/db');
const { USERNAME } = require('../lib/config');
const { createChecker, main } = require('../lib/check');

main(async () => {
  const { userId, creatureId } = await getTestUser();
  // The other test account's character (see setup.js), never a real account's
  const foreignId = await withDb(async db => {
    const other = await db.collection('users').findOne({ username: `${USERNAME}-other` }, { projection: { _id: 1 } });
    if (!other) return undefined;
    return (await db.collection('creatures').findOne({
      owner: other._id, writers: { $ne: userId }, removed: { $ne: true },
    }, { projection: { _id: 1 } }))?._id;
  });
  const { browser, page, messages } = await openPage();
  const { step, finish } = createChecker('Actions: targets');
  await visit(page, `/character/${creatureId}`, 6000);

  const insertAction = target => page.evaluate(({ creatureId, target }) => window.Meteor.callAsync('actions.insertAction', {
    action: { creatureId, task: { subtaskFn: 'reset', targetIds: [target], eventName: 'shortRest' }, results: [], taskCount: 0, _decisions: [] },
  }).then(() => null, e => e.reason || e.message), { creatureId, target });

  await step('targeting the acting character is accepted', messages, async () => {
    const refusal = await insertAction(creatureId);
    if (refusal) throw new Error(`refused: ${refusal}`);
  });
  await step("targeting another account's character is refused", null, async () => {
    if (!foreignId) throw new Error(`no character for ${USERNAME}-other: run "npm run setup"`);
    const refusal = await insertAction(foreignId);
    if (!refusal) throw new Error('accepted');
    return `refused: ${refusal}`;
  });
  await step('a skill check runs through its dialog', messages, async () => {
    const skill = await withDb(db => db.collection('creatureProperties').findOne(
      { 'root.id': creatureId, type: 'skill', variableName: 'athletics', removed: { $ne: true } }, { projection: { _id: 1 } }));
    if (!skill) throw new Error('no Athletics skill on the character: run "npm run setup"');
    await page.locator(`[data-id="check-btn-${skill._id}"]`).first().click();
    await page.waitForSelector('.dialog-stack .action-dialog', { timeout: 10000 });
    await page.waitForTimeout(1500);
    const abilities = await page.evaluate(() => document.querySelector('.dialog-stack .action-dialog')?.innerText || '');
    if (!/Strength/.test(abilities)) throw new Error('the check dialog does not offer the character\'s abilities');
    await page.locator('.dialog-stack #roll-hex').first().click();
    await page.waitForTimeout(3000);
    // The result preview must show the roll, not only the first log line (Vue 3
    // did not see the engine's updates to it)
    const preview = await page.evaluate(() => document.querySelector('.dialog-stack .log-preview')?.innerText || '');
    if (!/Roll[\s\S]*1d20/.test(preview)) throw new Error(`the result preview misses the roll: ${JSON.stringify(preview.slice(0, 80))}`);
    await page.locator('.dialog-stack .done-button').first().click();
    await page.waitForTimeout(2000);
    const open = await page.locator('.dialog-transition-group > *').count();
    if (open) throw new Error(`${open} dialog(s) left open after Done`);
  });
  await step('the Short rest button runs', messages, async () => {
    await page.locator('[data-id="rest-btn-shortRest"]').first().click();
    await page.waitForTimeout(4000);
    const open = await page.locator('.dialog-transition-group > *').count();
    if (open) throw new Error(`${open} dialog(s) left open`);
  });
  await step('log entries show their whole text', messages, async () => {
    const clipped = await page.evaluate(() => [...document.querySelectorAll('.character-log .log-entry')]
      .filter(e => e.scrollHeight > e.clientHeight + 1).length);
    const total = await page.locator('.character-log .log-entry').count();
    if (!total) throw new Error('no log entries to check (is the log drawer open?)');
    if (clipped) throw new Error(`${clipped} of ${total} entries cut off`);
    return `${total} entries, none cut off`;
  });
  await browser.close();
  finish();
});
