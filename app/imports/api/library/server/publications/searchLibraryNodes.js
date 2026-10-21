import { check } from 'meteor/check';
import Libraries from '/imports/api/library/Libraries';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import getCreatureLibraryIds from '/imports/api/library/getCreatureLibraryIds';
import getUserLibraryIds from '/imports/api/library/getUserLibraryIds';
import { assertViewPermission } from '/imports/api/sharing/sharingPermissions';
import escapeRegex from '/imports/api/utility/escapeRegex';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import { Meteor } from 'meteor/meteor';
import reactivePublication from '/imports/api/utility/server/reactivePublication';
import resultLimit from '/imports/api/library/server/publications/resultLimit';

// The nodes selected in the property dialog, with what is under them, so that
// they stay while the search changes; of libraries the user may view only
Meteor.publish('selectedLibraryNodes', async function (selectedNodeIds) {
  check(selectedNodeIds, [String]);
  // Limit to 20 selected nodes
  if (selectedNodeIds.length > 20) {
    selectedNodeIds = selectedNodeIds.slice(0, 20);
  }
  const viewableLibraries = new Set();
  const nodes = [];
  // Check view permissions of all libraries
  for (let id of selectedNodeIds) {
    let node = await LibraryNodes.findOneAsync(id);
    if (!node) continue;
    nodes.push(node);
    // The library it is in now, `root`: the `ancestors` of database version 2,
    // which only imported libraries still carry, can name the one it was in
    // before a move, and a node made since has none
    let libraryId = node.root?.id;
    if (viewableLibraries.has(libraryId)) {
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
      viewableLibraries.add(libraryId);
    }
  }
  // Return all nodes and their children
  return [LibraryNodes.find({
    $or: [
      { _id: { $in: nodes.map(node => node._id) } },
      { ...getFilter.descendantsOfAll(nodes) },
    ],
  })];
});

Meteor.publish('searchLibraryNodes', function (creatureId) {
  // One autorun: nesting them under reactive-publish 1.1 tore the results down
  // and republished them in a loop. See the note in slotFillers.js.
  let self = this;
  // The results carry _searchResult, which the client filters them on
  reactivePublication(this, async function ({ data }) {
    let type = data.type;
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
    /** @type {Record<string, any>} a MongoDB selector */
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
    const limit = resultLimit(data.limit, 32);

    // Get the search term
    let searchTerm = data.searchTerm || '';
    check(searchTerm, String);

    /** @type {import('meteor/mongo').Mongo.Options<any>} */
    let options;
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

    return [
      LibraryNodes.find(filter, options),
      Libraries.find({ _id: { $in: libraryIds } }),
    ];
  }, { data: ['type', 'limit', 'searchTerm'], addedFields: { libraryNodes: { _searchResult: true } } });
});
