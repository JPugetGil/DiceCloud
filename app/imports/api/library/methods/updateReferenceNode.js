import { ValidatedMethod } from 'meteor/mdg:validated-method';
import SimpleSchema from 'meteor/aldeed:simple-schema';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { getCollectionByName } from '/imports/api/parenting/docReferences';
import {
  assertDocEditPermission,
  assertViewPermission,
} from '/imports/api/sharing/sharingPermissions';
import { fetchDocByRef } from '/imports/api/parenting/parentingFunctions';
import errorText from '/imports/api/utility/errorText';

const updateReferenceNode = new ValidatedMethod({
  name: 'libraryNodes.updateReferenceNode',
  validate: new SimpleSchema({
    _id: {
      type: String,
      max: 32,
    }
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ _id }) {
    let userId = this.userId;
    let node = await libraryNodes().findOneAsync(_id);
    await assertDocEditPermission(node, userId);
    await updateReferenceNodeWork(node, userId);
  },
});

// By name, when called: LibraryNodes.ts calls updateReferenceNodeWork, and
// importing it here made an import cycle
const libraryNodes = () => getCollectionByName('libraryNodes');

async function writeCache(_id, cache) {
  await libraryNodes().updateAsync(_id, { $set: { cache } }, {
    selector: { type: 'reference' },
  });
}

async function updateReferenceNodeWork(node, userId) {
  /** @type {{ error?: string, node?: any, library?: { id: string, name: string } }} */
  let cache = {}
  if (!node.ref?.collection || !node.ref?.id) {
    await writeCache(node._id, cache);
    return;
  }
  let doc, library;
  try {
    doc = await fetchDocByRef(node.ref);
    if (doc.removed) throw 'Property has been deleted';
    if (doc.root.id !== node.root.id) {
      library = await fetchDocByRef(doc.root);
      await assertViewPermission(library, userId)
    }
  } catch (e) {
    cache = { error: errorText(e) }
    await writeCache(node._id, cache);
    return;
  }
  cache = {
    node: doc,
  };
  if (library) {
    cache.library = {
      id: library._id,
      name: library.name,
    };
  }
  await writeCache(node._id, cache);
}

export default updateReferenceNode;
export { updateReferenceNodeWork }
