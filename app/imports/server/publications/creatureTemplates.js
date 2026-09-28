import { check } from 'meteor/check';
import Libraries from '/imports/api/library/Libraries';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import { LIBRARY_NODE_TREE_FIELDS } from '/imports/server/publications/library';
import escapeRegex from '/imports/api/utility/escapeRegex';
import getUserLibraryIds from '/imports/api/library/getUserLibraryIds';

// Publish docs the user has already selected so they don't disappear when searching.
// Never implemented: the body always returned nothing, and its draft (which read
// an undefined `slot`) is in git history. Kept as a stub so a client subscribing
// gets a ready, empty subscription rather than an error.
Meteor.publish('selectedCreatureTemplates', function () {
  return [];
});

Meteor.publish('creatureTemplates', function (searchTerm) {
  if (searchTerm) check(searchTerm, String);

  // One autorun: nesting them under reactive-publish 1.1 tore the results down
  // and republished them in a loop. See the note in slotFillers.js.
  let self = this;
  this.autorun(async function () {
    let userId = this.userId;
    if (!userId) {
      return [];
    }

    // Get all the ids of libraries the user can access
    const userLibIds = await getUserLibraryIds(userId);
    const libraries = Libraries.find({
      $or: [
        { owner: userId },
        { writers: userId },
        { readers: userId },
        { _id: { $in: userLibIds }, public: true },
      ]
    }, {
      sort: { name: 1 }
    });

    const libraryIds = await libraries.mapAsync(lib => lib._id);

    // Build a filter for nodes in those libraries
    const filter = {
      'root.id': { $in: libraryIds },
      type: 'creature',
      removed: { $ne: true },
    }

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
      //filter.$text = { $search: searchTerm };
      options = {
        // relevant documents have a higher score.
        fields: {
          //_score: { $meta: 'textScore' },
          ...LIBRARY_NODE_TREE_FIELDS,
        },
        sort: {
          // `score` property specified in the projection fields above.
          //_score: { $meta: 'textScore' },
          name: 1,
          order: 1,
        }
      }
    } else {
      //delete filter.$text
      delete filter.name
      options = {
        sort: {
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
