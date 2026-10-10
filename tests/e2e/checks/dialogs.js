#!/usr/bin/env node
/**
 * Opens every lazily loaded dialog of the dialog stack and checks that its
 * component loads: without `defineAsyncComponent`, Vue 3 rendered them as the
 * text "[object Promise]". The list is read from DialogComponentIndex.js, so new
 * dialogs are covered. Dialogs open without their usual data here, so console
 * messages are reported but do not fail the check; the few that cannot render
 * at all without their required props get sample data from the test account.
 * The library node dialog opens an action of the SRD 5.1 bestiary without
 * `resources`, when the bestiary is imported, and must log nothing: imported
 * as generated, without what the schema fills in, such an action crashed its
 * viewer.
 */
const fs = require('fs');
const path = require('path');
const { openPage, visit, pushDialog } = require('../lib/browser');
const { createChecker, main } = require('../lib/check');
const { getTestUser, withDb } = require('../lib/db');
const { USERNAME } = require('../lib/config');

const INDEX = path.join(__dirname, '..', '..', '..', 'app', 'imports', 'ui', 'dialogStack', 'DialogComponentIndex.js');

main(async () => {
  const names = [...fs.readFileSync(INDEX, 'utf8').matchAll(/const (\w+) = defineAsyncComponent\(/g)]
    .map(m => m[1].replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase());
  const { userId, creatureId } = await getTestUser();
  const bestiaryAction = await withDb(async db => {
    const bestiary = await db.collection('libraries').findOne(
      { name: { $in: ['SRD 5.1 Bestiary', 'Bestiaire SRD 5.1'] } }, { projection: { _id: 1 } });
    return bestiary && db.collection('libraryNodes').findOne(
      { 'root.id': bestiary._id, type: 'action', resources: { $exists: false }, removed: { $ne: true } },
      { projection: { _id: 1, name: 1 } });
  });
  // Opened with real data: these must log nothing
  const STRICT = new Set(bestiaryAction ? ['library-node-dialog'] : []);
  const DATA = {
    ...bestiaryAction && { 'library-node-dialog': { _id: bestiaryAction._id } },
    'character-search-dialog': { creatureId },
    'creature-form-dialog': { _id: creatureId },
    'help-dialog': { path: 'property' },
    // Only opened: the transfer happens on its confirm button
    'transfer-ownership-dialog': {
      docRef: { collection: 'creatures', id: creatureId },
      user: { _id: userId, username: USERNAME },
    },
  };
  const { browser, page, messages } = await openPage();
  const { step, finish } = createChecker(`Dialogs: ${names.length} lazily loaded`);
  for (const name of names) {
    await step(name, null, async () => {
      // A fresh page each time: a dialog opened without its data can jam the stack
      await visit(page, '/character-list', 3000);
      messages.length = 0;
      await pushDialog(page, name, DATA[name]);
      await page.waitForTimeout(2500);
      const r = await page.evaluate(() => {
        const dialogs = document.querySelectorAll('.dialog-stack .dialog-component');
        const el = dialogs[dialogs.length - 1];
        return { rendered: !!el, promise: !!el && el.innerText.includes('[object Promise]') };
      });
      if (r.promise) throw new Error('renders "[object Promise]"');
      if (!r.rendered) throw new Error('nothing rendered');
      if (STRICT.has(name) && messages.length) {
        throw Object.assign(new Error(`${new Set(messages).size} console message(s) with "${bestiaryAction.name}" of the bestiary`),
          { details: [...new Set(messages)] });
      }
      if (STRICT.has(name)) return `"${bestiaryAction.name}", a bestiary action without resources`;
      if (messages.length) return `${new Set(messages).size} console message(s), opened without its usual data`;
    });
  }
  await browser.close();
  finish();
});
