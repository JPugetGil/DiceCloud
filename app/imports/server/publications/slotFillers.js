import { check } from 'meteor/check';
import Libraries from '/imports/api/library/Libraries';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import getSlotFillFilter from '/imports/api/creature/creatureProperties/methods/getSlotFillFilter'
import getCreatureLibraryIds from '/imports/api/library/getCreatureLibraryIds';
import { LIBRARY_NODE_TREE_FIELDS } from '/imports/server/publications/library';
import escapeRegex from '/imports/api/utility/escapeRegex';

// Publish docs the user has already selected so they don't disappear when searching
Meteor.publish('selectedFillers', function (slotId, nodeIds, isDummySlot) {
  this.autorun(async function () {
    let userId = this.userId;
    if (!userId) {
      return [];
    }

    // Get the slot from the right collection
    let slot;
    if (isDummySlot) {
      slot = await LibraryNodes.findOneAsync(slotId);
    } else {
      slot = await CreatureProperties.findOneAsync(slotId);
    }

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

    let filter = { _id: { $in: nodeIds } };
    // Get the limit of the documents the user can fetch
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

Meteor.publish('slotFillers', function (slotId, searchTerm, isDummySlot) {
  if (searchTerm) check(searchTerm, String);

  // One autorun. These used to nest autoruns, and under
  // reactive-publish 1.1 that looped: the nested results were torn down and
  // republished every ~75ms, so the dialog flickered between full, partial and
  // empty. The inner autoruns read nothing reactive of their own, apart from
  // the subscription's limit, which this autorun still depends on.
  let self = this;
  this.autorun(async function () {
    let userId = this.userId;
    if (!userId) {
      return [];
    }

    // Get the slot from the right collection
    let slot;
    if (isDummySlot) {
      slot = await LibraryNodes.findOneAsync(slotId);
    } else {
      slot = await CreatureProperties.findOneAsync(slotId);
    }

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
    var limit = (await self.data('limit')) || 50;
    check(limit, Number);

    let options = undefined;
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
        fields: LIBRARY_NODE_TREE_FIELDS,
      };
    }
    options.limit = limit;

    await self.setData('countAll', await LibraryNodes.find(filter).countAsync());
    await self.setData('libraryNodeFilter', EJSON.stringify(filter));
    return [
      LibraryNodes.find(filter, options),
      libraries
    ];
  });
});

Meteor.publish('classFillers', function (classId) {
  // One autorun. These used to nest autoruns, and under
  // reactive-publish 1.1 that looped: the nested results were torn down and
  // republished every ~75ms, so the dialog flickered between full, partial and
  // empty. The inner autoruns read nothing reactive of their own, apart from
  // the subscription's limit, which this autorun still depends on.
  let self = this;
  if (!classId) return [];

  this.autorun(async function () {
    let userId = this.userId;
    if (!userId) {
      return [];
    }
    // Get the class
    let classProp = await CreatureProperties.findOneAsync(classId);
    if (!classProp) {
      return [];
    }

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
    var limit = (await self.data('limit')) || 50;
    check(limit, Number);

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
  });
});
