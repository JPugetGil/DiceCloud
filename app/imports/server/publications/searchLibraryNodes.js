import { check } from 'meteor/check';
import Libraries from '/imports/api/library/Libraries';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import getCreatureLibraryIds from '/imports/api/library/getCreatureLibraryIds';
import getUserLibraryIds from '/imports/api/library/getUserLibraryIds';
import { assertViewPermission } from '/imports/api/sharing/sharingPermissions';
import escapeRegex from '/imports/api/utility/escapeRegex';
import { getFilter } from '/imports/api/parenting/parentingFunctions';

Meteor.publish('selectedLibraryNodes', async function (selectedNodeIds) {
  check(selectedNodeIds, Array);
  // Limit to 20 selected nodes
  if (selectedNodeIds.length > 20) {
    selectedNodeIds = selectedNodeIds.slice(0, 20);
  }
  let libraryViewPermissions = {};
  const nodes = [];
  // Check view permissions of all libraries
  for (let id of selectedNodeIds) {
    let node = await LibraryNodes.findOneAsync(id);
    if (!node) continue;
    nodes.push(node);
    let libraryId = node.ancestors[0].id;
    if (libraryViewPermissions[id]) {
      continue;
    } else {
      let library = await Libraries.findOneAsync(libraryId, {
        fields: {
          owner: 1,
          readers: 1,
          writers: 1,
          public: 1,
          root: 1,
          left: 1,
          right: 1,
        }
      });
      await assertViewPermission(library, this.userId);
      libraryViewPermissions[id] = true;
    }
  }
  // Return all nodes and their children
  return [LibraryNodes.find({
    $or: [
      { _id: { $in: selectedNodeIds } },
      { ...getFilter.descendantsOfAll(nodes) },
    ],
  })];
});

Meteor.publish('searchLibraryNodes', function (creatureId) {
  // One autorun: nesting them under reactive-publish 1.1 tore the results down
  // and republished them in a loop. See the note in slotFillers.js.
  let self = this;
  this.autorun(async function (computation) {
    let type = await self.data('type');
    if (!type) return [];

    let userId = this.userId;
    if (!userId) {
      return [];
    }

    // Get all the ids of libraries the user can access
    let libraryIds;
    if (creatureId) {
      libraryIds = await getCreatureLibraryIds(creatureId, userId)
    } else {
      libraryIds = await getUserLibraryIds(userId)
    }

    // Build a filter for nodes in those libraries that match the type
    let filter = {
      ...getFilter.descendantsOfAllRoots(libraryIds),
      removed: { $ne: true },
      searchable: true //library nodes must opt-in
    };
    if (type) {
      filter.$or = [{
        type,
      }, {
        slotFillerType: type,
      }];
    }

    // Get the limit of the documents the user can fetch
    var limit = (await self.data('limit')) || 32;
    check(limit, Number);

    // Get the search term
    let searchTerm = (await self.data('searchTerm')) || '';
    check(searchTerm, String);

    let options = undefined;
    if (searchTerm) {
      // Regex search instead of text index
      filter.$and = [{
        $or: [
          { name: { $regex: escapeRegex(searchTerm), '$options': 'i' } },
          { libraryTags: searchTerm },
        ],
      }];
      // filter.$text = {$search: searchTerm};
      options = {
        /*
        // relevant documents have a higher score.
        fields: {
          score: { $meta: 'textScore' }
        },
        */
        sort: {
          // `score` property specified in the projection fields above.
          // score: { $meta: 'textScore' },
          'root.id': 1,
          name: 1,
          left: 1,
        }
      }
    } else {
      //delete filter.$text
      delete filter.$and;
      options = {
        sort: {
          'root.id': 1,
          name: 1,
          left: 1,
        }
      };
    }
    options.limit = limit;

    await self.setData('countAll', await LibraryNodes.find(filter).countAsync());

    let cursor = LibraryNodes.find(filter, options);
    let observeHandle = await cursor.observeChangesAsync({
      added: function (id, fields) {
        fields._searchResult = true;
        self.added('libraryNodes', id, fields);
      },
      changed: function (id, fields) {
        self.changed('libraryNodes', id, fields);
      },
      removed: function (id) {
        self.removed('libraryNodes', id);
      }
    },
      // Publications don't mutate the documents
      { nonMutatingCallbacks: true }
    );

    // These results are published by hand, so stop this run's observer when
    // the next run (a new search term or limit) replaces it. onStop alone only
    // fired when the whole subscription ended, leaving one live observer per
    // keystroke until then.
    computation.onInvalidate(function () {
      observeHandle.stop();
    });
    this.onStop(function () {
      observeHandle.stop();
    });

    return [Libraries.find({ _id: { $in: libraryIds } })];
  });
});
