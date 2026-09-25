#!/usr/bin/env node
/**
 * Opens a library slot in test mode (the slot fill dialog with a dummy slot, as
 * the library page does) and checks that it lists the fillers the database holds
 * for it. The dialog once passed vue-meteor-tracker's `sub` ref to
 * subscriptionData() instead of the handle, so it never saw the subscription's
 * filter and every slot showed an empty list ("Explore the Library!" in the
 * Libraries of Vexus); fillers whose requirements failed were also offered.
 *
 * Needs a library with slots and fillers that the test account can use, for
 * example after subscribing it to a library collection; skipped otherwise.
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

main(async () => {
  const { userId } = await getTestUser();
  const slot = await findSlotWithFillers(userId);
  const { step, finish } = createChecker('Slot fill dialog');
  if (!slot) {
    console.log('  - skipped: the test account can use no library slot with fillers');
    finish();
    return;
  }
  const { browser, page, messages } = await openPage();
  await step(`"${slot.name}" lists its ${slot.count} filler(s)`, messages, async () => {
    await visit(page, '/library', 3000);
    await page.evaluate(id => new Promise(r => window.Meteor.subscribe('libraryNode', id, { onReady: r })), slot.id);
    const dummySlot = await page.evaluate(id => window.Meteor.connection._stores.libraryNodes._getCollection().findOne(id), slot.id);
    await pushDialog(page, 'SlotFillDialog', { dummySlot });
    await page.waitForTimeout(6000);
    const { shown, hidden } = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('.dialog-stack .dialog-component');
      const el = dialogs[dialogs.length - 1];
      const note = el.innerText.match(/Requirements of (\d+) properties were not met/);
      return { shown: el.querySelectorAll('.v-expansion-panel').length, hidden: note ? +note[1] : 0 };
    });
    if (shown + hidden !== slot.count) {
      throw new Error(`shows ${shown} and hides ${hidden}, expected ${slot.count} in all`);
    }
    return `${shown} shown, ${hidden} with requirements not met`;
  });
  await browser.close();
  finish();
});
