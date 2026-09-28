#!/usr/bin/env node
/**
 * Opens every lazily loaded dialog of the dialog stack and checks that its
 * component loads: without `defineAsyncComponent`, Vue 3 rendered them as the
 * text "[object Promise]". The list is read from DialogComponentIndex.js, so new
 * dialogs are covered. Dialogs open without their usual data here, so console
 * messages are reported but do not fail the check.
 */
const fs = require('fs');
const path = require('path');
const { openPage, visit, pushDialog } = require('../lib/browser');
const { createChecker, main } = require('../lib/check');

const INDEX = path.join(__dirname, '..', '..', '..', 'app', 'imports', 'client', 'ui', 'dialogStack', 'DialogComponentIndex.js');

main(async () => {
  const names = [...fs.readFileSync(INDEX, 'utf8').matchAll(/const (\w+) = defineAsyncComponent\(/g)]
    .map(m => m[1].replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase());
  const { browser, page, messages } = await openPage();
  const { step, finish } = createChecker(`Dialogs: ${names.length} lazily loaded`);
  for (const name of names) {
    await step(name, null, async () => {
      // A fresh page each time: a dialog opened without its data can jam the stack
      await visit(page, '/character-list', 3000);
      messages.length = 0;
      await pushDialog(page, name);
      await page.waitForTimeout(2500);
      const r = await page.evaluate(() => {
        const dialogs = document.querySelectorAll('.dialog-stack .dialog-component');
        const el = dialogs[dialogs.length - 1];
        return { rendered: !!el, promise: !!el && el.innerText.includes('[object Promise]') };
      });
      if (r.promise) throw new Error('renders "[object Promise]"');
      if (!r.rendered) throw new Error('nothing rendered');
      if (messages.length) return `${new Set(messages).size} console message(s), opened without its usual data`;
    });
  }
  await browser.close();
  finish();
});
