#!/usr/bin/env node
/**
 * Actions on a library and its nodes that silently did nothing.
 *
 * - The sharing dialog's "Who can copy" called the method object itself,
 *   which threw: the option was never saved.
 * - "Create reference" in a node's menu read the node's `parent`, a field of
 *   the schema before version 3: the method refused the missing reference.
 * - The buff remover's form compared `model-value`, which a template reads
 *   as `model - value`: "Remove parent buff" and "Remove all buffs" always
 *   saved nothing.
 *
 * Uses a library of the test account's own with a buff remover in it, put
 * straight into the database (only admins create libraries in the app) and
 * removed at the end, with the reference the check makes.
 */
const { openPage, visit, pushDialog } = require('../lib/browser');
const { createChecker, main } = require('../lib/check');
const { withDb, getTestUser } = require('../lib/db');

const LIBRARY_ID = 'e2eNodeActionsLib';
const NODE_ID = 'e2eNodeActionsBuffRm';

const library = () => withDb(db => db.collection('libraries').findOne({ _id: LIBRARY_ID }));
const node = () => withDb(db => db.collection('libraryNodes').findOne({ _id: NODE_ID }));
const references = () => withDb(db => db.collection('libraryNodes').find({
  type: 'reference', 'ref.id': NODE_ID, removed: { $ne: true },
}).toArray());

async function removeOwnLibrary() {
  await withDb(async db => {
    await db.collection('libraryNodes').deleteMany({ 'root.id': LIBRARY_ID });
    await db.collection('libraries').deleteOne({ _id: LIBRARY_ID });
  });
}

async function insertOwnLibrary(userId) {
  await removeOwnLibrary();
  await withDb(async db => {
    await db.collection('libraries').insertOne({
      _id: LIBRARY_ID, name: 'E2E node actions library', owner: userId,
      readers: [], writers: [], public: false, readersCanCopy: false,
    });
    await db.collection('libraryNodes').insertOne({
      _id: NODE_ID, type: 'buffRemover', name: 'E2E remove buffs', tags: [], libraryTags: [],
      root: { collection: 'libraries', id: LIBRARY_ID }, left: 1, right: 2,
      target: 'self', targetTags: [], extraTags: [],
    });
  });
}

main(async () => {
  const { userId } = await getTestUser();
  const { step, finish } = createChecker('Library node actions');
  const { browser, page, messages } = await openPage({ colorScheme: 'light' });
  await insertOwnLibrary(userId);
  try {
    await step('the sharing dialog saves "Who can copy"', messages, async () => {
      await visit(page, '/library', 4000);
      await pushDialog(page, 'ShareDialog', { docRef: { collection: 'libraries', id: LIBRARY_ID } });
      const dialog = page.locator('.dialog-stack .dialog-component').last();
      await dialog.getByLabel('Who can copy from this library').click({ force: true });
      await page.locator('.v-overlay--active .v-list-item', { hasText: 'Anyone with read permission' }).click();
      await page.waitForTimeout(2000);
      if ((await library()).readersCanCopy !== true) throw new Error('readersCanCopy not saved');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
    });

    await step('"Create reference" in a node\'s menu makes a reference beside it', messages, async () => {
      await visit(page, '/library', 3000);
      // The node's menu is in its editing toolbar
      await pushDialog(page, 'LibraryNodeDialog', { _id: NODE_ID, startInEditTab: true });
      await page.waitForSelector('[data-id="property-toolbar-menu-button"]', { timeout: 15000 });
      await page.locator('[data-id="property-toolbar-menu-button"]').last().click();
      await page.locator('.v-overlay--active .v-list-item', { hasText: 'Create reference' }).click();
      await page.waitForTimeout(2500);
      const made = await references();
      if (made.length !== 1) throw new Error(`${made.length} references made`);
      const [reference] = made;
      if (reference.root?.id !== LIBRARY_ID || reference.parentId) {
        throw new Error(`made at ${JSON.stringify({ root: reference.root, parentId: reference.parentId })}`);
      }
      return 'at the library\'s root, as the node';
    });

    await step('the buff remover\'s form saves "Remove parent buff" and "Remove all buffs"', messages, async () => {
      await visit(page, '/library', 3000);
      await pushDialog(page, 'LibraryNodeDialog', { _id: NODE_ID, startInEditTab: true });
      const dialog = page.locator('.dialog-stack .dialog-component').last();
      await dialog.locator('button', { hasText: 'Remove parent buff' }).click({ timeout: 15000 });
      await page.waitForTimeout(2000);
      if ((await node()).targetParentBuff !== true) throw new Error('targetParentBuff not saved');
      await dialog.locator('button', { hasText: 'Remove tagged buffs' }).click();
      await page.waitForTimeout(2000);
      if ((await node()).targetParentBuff) throw new Error('targetParentBuff not cleared');
      await dialog.locator('button', { hasText: 'Remove all buffs' }).click();
      await page.waitForTimeout(2000);
      if ((await node()).removeAll !== true) throw new Error('removeAll not saved');
    });
  } finally {
    await removeOwnLibrary();
    await browser.close();
  }
  finish();
});
