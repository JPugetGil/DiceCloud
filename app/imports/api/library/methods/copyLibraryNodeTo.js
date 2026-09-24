import { ValidatedMethod } from 'meteor/mdg:validated-method';
import SimpleSchema from 'meteor/aldeed:simple-schema';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { RefSchema } from '/imports/api/parenting/ChildSchema';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import {
  assertDocCopyPermission,
  assertDocEditPermission
} from '/imports/api/sharing/sharingPermissions';
import {
  renewDocIds,
  getFilter
} from '/imports/api/parenting/parentingFunctions';
import { rebuildNestedSets } from '/imports/api/parenting/parentingFunctions';
import { fetchDocByRef } from '/imports/api/parenting/parentingFunctions';
import batchInsertAsync from '/imports/api/utility/batchInsertAsync';

var snackbar;
if (Meteor.isClient) {
  // require(), not import: this module is only pulled in on one side of the
  // wire, and a static import would bundle it into both
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  snackbar = require(
    '/imports/client/ui/components/snackbars/SnackbarQueue'
  ).snackbar
}

const DUPLICATE_CHILDREN_LIMIT = 500;

const copyLibraryNodeTo = new ValidatedMethod({
  name: 'libraryNodes.copyTo',
  validate: new SimpleSchema({
    _id: {
      type: String,
      max: 32,
    },
    parent: {
      type: RefSchema,
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 1,
    timeInterval: 10000,
  },
  async run({ _id, parent }) {
    if (parent.collection !== 'libraryNodes' && parent.collection !== 'libraries') {
      throw new Meteor.Error('Invalid destination',
        'Library documents can only be copied to destinations inside other libraries'
      );
    }
    const libraryNode = await LibraryNodes.findOneAsync(_id);
    if (!libraryNode) throw new Meteor.Error('not-found', 'Library node was not found');

    const parentDoc = await fetchDocByRef(parent);
    await assertDocCopyPermission(libraryNode, this.userId);
    await assertDocEditPermission(parentDoc, this.userId);

    let decendants = await LibraryNodes.find({
      ...getFilter.descendants(libraryNode),
      removed: { $ne: true },
    }, {
      limit: DUPLICATE_CHILDREN_LIMIT + 1,
      sort: { left: 1 },
    }).fetchAsync();

    if (decendants.length > DUPLICATE_CHILDREN_LIMIT) {
      decendants.pop();
      if (Meteor.isClient) {
        snackbar({
          text: `Only the first ${DUPLICATE_CHILDREN_LIMIT} children were duplicated`,
        });
      }
    }

    const nodes = [libraryNode, ...decendants];

    // Give the docs new IDs without breaking internal references
    renewDocIds({ docArray: nodes });

    // Order the root node
    libraryNode.left = Number.MAX_SAFE_INTEGER - 1;
    libraryNode.right = Number.MAX_SAFE_INTEGER;

    await batchInsertAsync(LibraryNodes, nodes);

    // Tree structure changed by inserts, reorder the tree
    await rebuildNestedSets(LibraryNodes, parentDoc.root.id);
  },
});

export default copyLibraryNodeTo;
