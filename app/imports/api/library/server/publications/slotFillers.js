import { check, Match } from 'meteor/check';
import Libraries from '/imports/api/library/Libraries';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import getSlotFillFilter from '/imports/api/creature/creatureProperties/methods/getSlotFillFilter'
import getCreatureLibraryIds from '/imports/api/library/getCreatureLibraryIds';
import { LIBRARY_NODE_TREE_FIELDS } from '/imports/api/library/server/publications/library';
import { assertDocViewPermission } from '/imports/api/sharing/sharingPermissions';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import escapeRegex from '/imports/api/utility/escapeRegex';
import { EJSON } from 'meteor/ejson';
import { Meteor } from 'meteor/meteor';
import reactivePublication from '/imports/api/utility/server/reactivePublication';

// The fillers selected in a dialog that one subscription sends: its cursor's limit
const MAX_SELECTED_FILLERS = 100;

const SelectedNodeIds = Match.Where(ids => Array.isArray(ids)
  && ids.length <= MAX_SELECTED_FILLERS && ids.every(id => typeof id === 'string'));

/**
 * The slot (or class) a dialog fills, from its collection, if the user may
 * view what it belongs to: a creature's property, or a library's slot that its
 * editor tries out (a dummy slot). Nothing otherwise: these publications sent
 * the fillers matching anyone's slot by its id, and the slot's own tags and
 * type with the filter
 */
async function readableSlot(collection, slotId, userId) {
  // A dialog opened without a slot: nothing, as before
  if (!userId || !slotId) return undefined;
  const slot = await collection.findOneAsync(slotId);
  if (!slot) return undefined;
  try {
    await assertDocViewPermission(slot, userId);
  } catch {
    return undefined;
  }
  return slot;
}

// Publish docs the user has already selected so they don't disappear when searching
Meteor.publish('selectedFillers', function (slotId, nodeIds, isDummySlot) {
  check(slotId, Match.Maybe(String));
  check(nodeIds, SelectedNodeIds);
  check(isDummySlot, Match.Maybe(Boolean));
  reactivePublication(this, async function () {
    let userId = this.userId;
    const slot = await readableSlot(isDummySlot ? LibraryNodes : CreatureProperties, slotId, userId);
    if (!slot) return [];

    // Get all the ids of libraries the user can access
    const creatureId = slot.root.id;
    const libraryIds = await getCreatureLibraryIds(creatureId, userId);
    const libraries = Libraries.find({
      $or: [
        { owner: userId },
        { writers: userId },
        { readers: userId },
        { _id: { $in: libraryIds }, public: true },
      ]
    }, {
      sort: { name: 1 }
    });

    // Only nodes of those libraries: this sent any node whose id the client
    // named, those of private libraries too
    let filter = { _id: { $in: nodeIds }, ...getFilter.descendantsOfAllRoots(libraryIds) };
    // Get the limit of the documents the user can fetch
    /** @type {import('meteor/mongo').Mongo.Options<any>} */
    let options = {
      sort: {
        name: 1,
        order: 1,
      },
      limit: 100,
      fields: LIBRARY_NODE_TREE_FIELDS,
    };
    return [
      LibraryNodes.find(filter, options),
      libraries
    ];
  });
});

// The texts a filler's one-line preview is taken from
const PREVIEW_FIELDS = { 'summary.text': 1, 'description.text': 1 };

Meteor.publish('slotFillers', function (slotId, searchTerm, isDummySlot) {
  check(slotId, Match.Maybe(String));
  if (searchTerm) check(searchTerm, String);
  check(isDummySlot, Match.Maybe(Boolean));

  // One autorun. These used to nest autoruns, and under
  // reactive-publish 1.1 that looped: the nested results were torn down and
  // republished every ~75ms, so the dialog flickered between full, partial and
  // empty. The inner autoruns read nothing reactive of their own, apart from
  // the subscription's limit, which reruns it (passed as data).
  let self = this;
  reactivePublication(this, async function ({ data }) {
    let userId = this.userId;
    const slot = await readableSlot(isDummySlot ? LibraryNodes : CreatureProperties, slotId, userId);
    if (!slot) return [];

    // Get all the ids of libraries the user can access
    const creatureId = slot.root.id;
    const libraryIds = await getCreatureLibraryIds(creatureId, userId);
    const libraries = Libraries.find({
      $or: [
        { owner: userId },
        { writers: userId },
        { readers: userId },
        { _id: { $in: libraryIds }, public: true },
      ]
    }, {
      sort: { name: 1 }
    });

    // Build a filter for nodes in those libraries that match the slot
    let filter = getSlotFillFilter({ slot, libraryIds });
    // Get the limit of the documents the user can fetch
    var limit = data.limit || 50;
    check(limit, Number);

    /** @type {import('meteor/mongo').Mongo.Options<any>} */
    let options;
    if (searchTerm) {
      if (!filter.$and) filter.$and = [];
      filter.$and.push({
        $or: [
          { name: { $regex: escapeRegex(searchTerm), '$options': 'i' } },
          { libraryTags: searchTerm }
        ]
      });
      options = {
        fields: {
          ...LIBRARY_NODE_TREE_FIELDS,
          ...PREVIEW_FIELDS,
        },
        sort: {
          'cache.node.name': 1,
          name: 1,
          order: 1,
        }
      }
    } else {
      //delete filter.$text
      delete filter.name
      options = {
        sort: {
          // References sorted in name order, but with non-references first, because undefined
          // is sorted before docs with cached name defined
          'cache.node.name': 1,
          name: 1,
          order: 1,
        },
        fields: { ...LIBRARY_NODE_TREE_FIELDS, ...PREVIEW_FIELDS },
      };
    }
    options.limit = limit;

    await self.setData('countAll', await LibraryNodes.find(filter).countAsync());
    await self.setData('libraryNodeFilter', EJSON.stringify(filter));
    return [
      LibraryNodes.find(filter, options),
      libraries
    ];
  }, { data: ['limit'] });
});

Meteor.publish('classFillers', function (classId) {
  // One autorun. These used to nest autoruns, and under
  // reactive-publish 1.1 that looped: the nested results were torn down and
  // republished every ~75ms, so the dialog flickered between full, partial and
  // empty. The inner autoruns read nothing reactive of their own, apart from
  // the subscription's limit, which reruns it (passed as data).
  let self = this;
  if (!classId) return [];
  check(classId, String);

  reactivePublication(this, async function ({ data }) {
    let userId = this.userId;
    // Get the class
    const classProp = await readableSlot(CreatureProperties, classId, userId);
    if (!classProp) return [];

    // Get all the ids of libraries the user can access
    const creatureId = classProp.root.id;
    const libraryIds = await getCreatureLibraryIds(creatureId, userId);
    const libraries = Libraries.find({
      $or: [
        { owner: userId },
        { writers: userId },
        { readers: userId },
        { _id: { $in: libraryIds }, public: true },
      ]
    }, {
      sort: { name: 1 }
    });

    // Build a filter for nodes in those libraries that match the slot
    let filter = getSlotFillFilter({ slot: classProp, libraryIds });

    // Get the limit of the documents the user can fetch
    var limit = data.limit || 50;
    check(limit, Number);

    /** @type {import('meteor/mongo').Mongo.Options<any>} */
    let options = {
      sort: {
        level: 1,
        name: 1,
        order: 1,
      },
      fields: LIBRARY_NODE_TREE_FIELDS,
      limit,
    };

    await self.setData('countAll', await LibraryNodes.find(filter).countAsync());
    await self.setData('libraryNodeFilter', EJSON.stringify(filter));
    return [LibraryNodes.find(filter, options), libraries];
  }, { data: ['limit'] });
});
