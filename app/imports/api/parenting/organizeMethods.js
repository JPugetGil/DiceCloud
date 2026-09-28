import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { Meteor } from 'meteor/meteor';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { RefSchema } from '/imports/api/parenting/ChildSchema';
import { assertDocEditPermission, assertEditPermission } from '/imports/api/sharing/sharingPermissions';
import { compact } from 'lodash';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { fetchDocByRefAsync, getCollectionByName, moveDocBetweenRoots, moveDocWithinRoot } from '/imports/api/parenting/parentingFunctions';

const moveBetweenRoots = new ValidatedMethod({
  name: 'organize.moveDocBetweenRoots',
  validate: new SimpleSchema({
    docRef: RefSchema,
    newPosition: {
      type: Number, // Must end in .5
    },
    newRootRef: RefSchema,
    skipRecompute: {
      type: Boolean,
      optional: true,
    },
    skipClient: {
      type: Boolean,
      optional: true,
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ docRef, newPosition, newRootRef, skipRecompute, skipClient }) {
    if (skipClient && this.isSimulation) {
      return;
    }
    let doc = await fetchDocByRefAsync(docRef);
    let collection = getCollectionByName(docRef.collection);
    // The user must be able to edit both the doc and its parent to move it
    // successfully
    await assertDocEditPermission(doc, this.userId);
    const newRoot = await fetchDocByRefAsync(newRootRef);
    await assertEditPermission(newRoot, this.userId);


    // Move the doc
    await moveDocBetweenRoots(doc, collection, newRootRef, newPosition);

    // Figure out which creatures need to be recalculated after this move
    const creatureIdsToRecalculate = compact([
      getCreatureAncestorId(doc),
      getCreatureAncestorId(newRoot),
    ]);

    // Mark the creatures for recompute
    if (!skipRecompute && creatureIdsToRecalculate.length) {
      await Creatures.updateAsync({
        _id: { $in: creatureIdsToRecalculate },
      }, {
        $set: { dirty: true },
      });
    }
  },
});

const moveWithinRoot = new ValidatedMethod({
  name: 'organize.moveDocWithinRoot',
  validate: new SimpleSchema({
    docRef: RefSchema,
    newPosition: {
      type: Number, // Must end in .5
    },
    skipRecompute: {
      type: Boolean,
      optional: true,
    },
    skipClient: {
      type: Boolean,
      optional: true,
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ docRef, newPosition, skipRecompute, skipClient }) {
    if (skipClient && this.isSimulation) {
      return;
    }
    let doc = await fetchDocByRefAsync(docRef);
    let collection = getCollectionByName(docRef.collection);

    // The user must be able to edit the doc
    await assertDocEditPermission(doc, this.userId);

    // Move the doc
    await moveDocWithinRoot(doc, collection, newPosition);

    // Figure out which creature needs to be recalculated after this move
    const creatureIdToRecalculate = getCreatureAncestorId(doc);

    // Mark the creatures for recompute
    if (!skipRecompute && creatureIdToRecalculate) {
      await Creatures.updateAsync({
        _id: creatureIdToRecalculate,
      }, {
        $set: { dirty: true },
      });
    }
  },
});

function getCreatureAncestorId(doc) {
  if (doc.type === 'pc' || doc.type === 'npc' || doc.type === 'monster') {
    return doc._id;
  }
  if (doc?.root?.collection === 'creatures') {
    return doc.root.id;
  }
}

// `organizeDoc` was dropped in 4c778fa2 ("Rewrote parenting organize methods to
// avoid rebuilds"), which replaced parent/order based moves with the root and
// position based methods above. Two call sites were never ported:
// creatureProperties/methods/equipItem.js and the "move to parent" action in
// client/ui/library/LibraryNodeDialog.vue. Both still do
// `organizeDoc.callAsync(...)`.
//
// Meteor's CommonJS interop quietly resolved that stale named import to
// `undefined`, so those two calls have been throwing a TypeError at runtime
// ever since. A module bundler resolves imports statically and refuses to build
// at all, so this keeps the build honest while preserving the existing behaviour:
// the call still fails, just with an error that says why.
//
// TODO: port both call sites to moveWithinRoot/moveBetweenRoots (or add a
// parent-based method back) and delete this stub.
const organizeDoc = {
  callAsync() {
    throw new Meteor.Error(
      'organize-doc-removed',
      'organizeDoc was removed when parenting moved to nested sets. This call ' +
      'site still needs to be ported to moveWithinRoot or moveBetweenRoots.'
    );
  },
};

export { moveBetweenRoots, moveWithinRoot, organizeDoc };
