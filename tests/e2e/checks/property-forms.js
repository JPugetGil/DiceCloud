#!/usr/bin/env node
/**
 * Opens one library node of every property type found in public libraries, in
 * view and then edit mode, and checks its form:
 * - every select, combobox and autocomplete item carries the key Vuetify
 *   displays (`itemTitle`, default `title`): Vuetify 2's `text` printed
 *   "[object Object]";
 * - no field shows "false" (a Boolean-cast prop once hid every stored value);
 * - nothing logs a console error, including the viewers (one crashed).
 * Needs at least one public library; skips with a message otherwise.
 */
const { openPage, visit, pushDialog } = require('../lib/browser');
const { withDb } = require('../lib/db');
const { createChecker, main } = require('../lib/check');

main(async () => {
  const nodes = await withDb(async db => {
    const libraryIds = (await db.collection('libraries').find({ public: true }, { projection: { _id: 1 } }).toArray())
      .map(l => l._id);
    return db.collection('libraryNodes').aggregate([
      { $match: { 'root.id': { $in: libraryIds }, removed: { $ne: true } } },
      { $group: { _id: '$type', id: { $first: '$_id' } } },
      { $sort: { _id: 1 } },
    ]).toArray();
  });
  const { step, finish } = createChecker(`Property forms: ${nodes.length} property types`);
  if (!nodes.length) {
    console.log('  (no public library in this database: create or import one to cover the forms)');
    return finish();
  }
  const { browser, page, messages } = await openPage();
  await visit(page, '/library');
  for (const { _id: type, id } of nodes) {
    await step(type, messages, async () => {
      await pushDialog(page, 'library-node-dialog', { _id: id });
      await page.waitForTimeout(2500);
      const problems = await page.evaluate(async () => {
        const root = [...document.querySelectorAll('.dialog-stack .dialog-component')].pop();
        if (!root) return ['the dialog did not open'];
        const edit = [...root.querySelectorAll('button')].find(b => /^edit$/i.test(b.innerText.trim()));
        if (!edit) return ['no Edit button'];
        edit.click();
        await new Promise(resolve => setTimeout(resolve, 2500));
        const found = [];
        const seen = new Set();
        for (const el of root.querySelectorAll('*')) {
          let c = el.__vueParentComponent;
          while (c && !seen.has(c)) {
            seen.add(c);
            if (['VSelect', 'VCombobox', 'VAutocomplete'].includes(c.type.name)) {
              const key = typeof c.props.itemTitle === 'string' ? c.props.itemTitle : null;
              const bad = key && (c.props.items || []).find(item => item && typeof item === 'object' && !(key in item));
              if (bad) found.push(`"${c.props.label}" has an item without "${key}": ${JSON.stringify(bad).slice(0, 60)}`);
            }
            c = c.parent;
          }
        }
        if (root.innerText.includes('[object Object]')) found.push('shows "[object Object]"');
        for (const s of root.querySelectorAll('.v-select__selection-text, .v-combobox__selection-text, .v-autocomplete__selection-text, .v-chip__content')) {
          if (s.innerText.trim() === 'false') found.push('a field shows "false"');
        }
        document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('dialogStack').popDialogStack();
        return found;
      });
      await page.waitForTimeout(900);
      if (problems.length) throw new Error(problems.join('; '));
    });
  }
  await browser.close();
  finish();
});
