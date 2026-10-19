#!/usr/bin/env node
/**
 * The dialogs that list library nodes.
 *
 * Opens a library slot in test mode (the slot fill dialog with a dummy slot, as
 * the library page does) and checks that it lists the fillers the database holds
 * for it. The dialog once passed vue-meteor-tracker's `sub` ref to
 * subscriptionData() instead of the handle, so it never saw the subscription's
 * filter and every slot showed an empty list ("Explore the Library!" in the
 * Libraries of Vexus); fillers whose requirements failed were also offered.
 * Needs a library with slots and fillers that the test account can use, for
 * example after subscribing it to a library collection; skipped otherwise.
 *
 * Then the library tab of the insert property dialog lists a node of a library
 * of the test account's own, under that library's name. It read the library
 * from `ancestors`, which only nodes imported from database version 2 still
 * carry: any other node broke the list. Its panel, expanded, offers to open
 * the node's details: the button waited for Vuetify 2's `open` slot prop and
 * never showed. The library and its node go straight into the database, and
 * are removed at the end.
 */
const { openPage, visit, pushDialog } = require('../lib/browser');
const { createChecker, main } = require('../lib/check');
const { withDb, getTestUser } = require('../lib/db');

// Mirrors getUserLibraryIds and getSlotFillFilter for a dummy slot
async function findSlotWithFillers(userId) {
  return withDb(async db => {
    const user = await db.collection('users').findOne({ _id: userId });
    let libIds = user.subscribedLibraries || [];
    const collections = await db.collection('libraryCollections').find({
      $or: [{ owner: userId }, { writers: userId }, { readers: userId },
        { _id: { $in: user.subscribedLibraryCollections || [] }, public: true }],
    }).toArray();
    collections.forEach(c => { libIds = [...libIds, ...(c.libraries || [])]; });
    const libraries = await db.collection('libraries').find({
      $or: [{ owner: userId }, { writers: userId }, { readers: userId }, { _id: { $in: libIds }, public: true }],
    }, { projection: { _id: 1 } }).toArray();
    const libraryIds = libraries.map(l => l._id);
    if (!libraryIds.length) return null;
    const slots = await db.collection('libraryNodes').find({
      type: 'propertySlot', 'root.id': { $in: libraryIds }, removed: { $ne: true },
      'slotTags.0': { $exists: true }, 'extraTags.0': { $exists: false },
    }, { limit: 300 }).toArray();
    for (const slot of slots) {
      const filter = {
        fillSlots: true, removed: { $ne: true }, 'root.id': { $in: libraryIds },
        libraryTags: { $all: slot.slotTags },
      };
      if (slot.slotType) filter.$or = [{ type: slot.slotType }, { slotFillerType: slot.slotType }];
      const count = await db.collection('libraryNodes').countDocuments(filter);
      if (count > 0 && count <= 20) return { id: slot._id, name: slot.name, count };
    }
    return null;
  });
}

// A library of the test account's, with one note made in the app: no `ancestors`
const LIBRARY_ID = 'e2eInsertDialogLib';
const NODE_ID = 'e2eInsertDialogNot';
const LIBRARY_NAME = 'E2E insert dialog library';

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
      _id: LIBRARY_ID, name: LIBRARY_NAME, owner: userId, readers: [], writers: [], public: false,
    });
    await db.collection('libraryNodes').insertOne({
      _id: NODE_ID, type: 'note', name: 'E2E insert dialog note', tags: [], libraryTags: [],
      root: { collection: 'libraries', id: LIBRARY_ID }, parentId: LIBRARY_ID, left: 1, right: 2,
      searchable: true,
    });
  });
}

main(async () => {
  const { userId } = await getTestUser();
  const slot = await findSlotWithFillers(userId);
  const { step, finish } = createChecker('Library node dialogs');
  const { browser, page, messages } = await openPage();
  if (!slot) {
    console.log('  - skipped: the test account can use no library slot with fillers');
  } else await step(`"${slot.name}" lists its ${slot.count} filler(s)`, messages, async () => {
    await visit(page, '/library', 3000);
    await page.evaluate(id => new Promise(r => window.Meteor.subscribe('libraryNode', id, { onReady: r })), slot.id);
    const dummySlot = await page.evaluate(id => window.Meteor.connection._stores.libraryNodes._getCollection().findOne(id), slot.id);
    await pushDialog(page, 'SlotFillDialog', { dummySlot });
    await page.waitForTimeout(6000);
    const { shown, hidden } = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.dialog-stack .dialog-component');
      const el = dialogs[dialogs.length - 1];
      const note = el.innerText.match(/(\d+) options? hidden: (?:its|their) requirements/);
      return { shown: el.querySelectorAll('.v-expansion-panel').length, hidden: note ? +note[1] : 0 };
    });
    if (shown + hidden !== slot.count) {
      throw new Error(`shows ${shown} and hides ${hidden}, expected ${slot.count} in all`);
    }
    return `${shown} shown, ${hidden} with requirements not met`;
  });
  await step('the insert property dialog lists a library\'s note, under the library\'s name', messages, async () => {
    await insertOwnLibrary(userId);
    try {
      await visit(page, '/library', 3000);
      await pushDialog(page, 'InsertPropertyDialog', { forcedType: 'note' });
      const dialog = page.locator('.dialog-stack .dialog-component').last();
      // Type, Create, Library
      await dialog.locator('.v-tab').nth(2).click({ timeout: 15000 });
      const panel = await page.waitForSelector(`[data-id="${NODE_ID}"]`, { timeout: 15000 });
      const text = (await panel.innerText()).replace(/\s+/g, ' ');
      if (!text.includes(LIBRARY_NAME)) throw new Error(`the result reads "${text}"`);
      await panel.click();
      await page.waitForTimeout(800);
      if (!await page.locator(`[data-id="${NODE_ID}"] .mdi-window-restore`).isVisible()) {
        throw new Error('no button to open the node\'s details once expanded');
      }
      return `"${text}", its details offered once expanded`;
    } finally {
      await removeOwnLibrary();
    }
  });
  await browser.close();
  finish();
});
