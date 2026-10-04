import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import Libraries from '/imports/api/library/Libraries';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import LibraryCollections from '/imports/api/library/LibraryCollections';
import { rebuildNestedSets } from '/imports/api/parenting/parentingFunctions';
import { assertCopyPermission, assertViewPermission } from '/imports/api/sharing/sharingPermissions';
import { assertCanCreateLibrary } from '/imports/api/users/assertRolePermissions';
import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';

/*
 * Libraries in and out of the app as files. A file holds one library or a
 * whole collection: { meta, collection?, libraries: [{ library, nodes }] }.
 * The import also reads the bare [{ library, nodes }] that tools/libraryImport
 * pulls from another instance, whose nodes may still be of database version 2
 * (ancestors/parent/order). Libraries and nodes keep their ids, so the
 * references between libraries hold, and importing a file twice changes
 * nothing unless the admin asks to replace what is there.
 */

export const LIBRARY_FILE_TYPE = 'DiceCloud Libraries';

// The largest libraries have about 10,000 nodes; one method call carries one library
export const MAX_IMPORTED_NODES = 25000;

const rateLimit = { numRequests: 5, timeInterval: 5000 };

const errorMessage = error => (error instanceof Error ? error.message : String(error));

function invalid(message) {
  return new Meteor.Error('invalid-library-file', message);
}

/**
 * The nodes of an imported library as this database stores them: version 3
 * parenting (root, parentId, left, right), every node in the library, none
 * removed. The nested sets are rebuilt after the insert.
 */
export function prepareImportedNodes(nodes, libraryId) {
  const seen = new Set();
  const prepared = [];
  for (const node of nodes) {
    if (!node || typeof node !== 'object' || typeof node._id !== 'string'
      || !node._id || node._id.length > 32) {
      throw invalid('A node of the library has no valid id');
    }
    if (typeof node.type !== 'string') throw invalid(`Node ${node._id} has no type`);
    if (seen.has(node._id)) throw invalid(`Node ${node._id} is in the file twice`);
    seen.add(node._id);
    if (node.removed) continue;
    const doc = { ...node };
    if (!doc.root && Array.isArray(doc.ancestors)) {
      // Database version 2: the same mapping as tools/libraryImport
      if (doc.ancestors[0]?.id !== libraryId) {
        throw invalid(`Node ${doc._id} belongs to another library`);
      }
      if (doc.parent?.collection === 'libraryNodes') doc.parentId = doc.parent.id;
      doc.left = doc.order ?? 0;
      doc.right = doc.order ?? 0;
      delete doc.ancestors;
      delete doc.parent;
      delete doc.order;
    } else if (doc.root?.id !== libraryId) {
      throw invalid(`Node ${doc._id} belongs to another library`);
    }
    doc.root = { collection: 'libraries', id: libraryId };
    delete doc.removedAt;
    prepared.push(doc);
  }
  return prepared;
}

async function insertNodes(nodes) {
  const raw = LibraryNodes.rawCollection();
  for (let i = 0; i < nodes.length; i += 1000) {
    await raw.insertMany(nodes.slice(i, i + 1000), { ordered: false });
  }
}

/** A library and its nodes, to save as a file. Needs the right to copy it */
export const exportLibrary = new ValidatedMethod({
  name: 'libraries.export',
  validate: new SimpleSchema({ libraryId: { type: String, max: 32 } }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ libraryId }) {
    if (Meteor.isClient) return;
    const library = await Libraries.findOneAsync(libraryId);
    if (!library) throw new Meteor.Error('not-found', 'This library does not exist');
    await assertCopyPermission(library, this.userId);
    const nodes = await LibraryNodes.find(
      { 'root.id': libraryId, removed: { $ne: true } }, { sort: { left: 1 } },
    ).fetchAsync();
    return {
      library: { _id: library._id, name: library.name, description: library.description },
      nodes,
    };
  },
});

/** A library collection's name and the libraries it holds, to save as a file */
export const exportLibraryCollection = new ValidatedMethod({
  name: 'libraryCollections.export',
  validate: new SimpleSchema({ libraryCollectionId: { type: String, max: 32 } }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ libraryCollectionId }) {
    if (Meteor.isClient) return;
    const collection = await LibraryCollections.findOneAsync(libraryCollectionId);
    if (!collection) throw new Meteor.Error('not-found', 'This library collection does not exist');
    await assertViewPermission(collection, this.userId);
    return {
      _id: collection._id,
      name: collection.name,
      description: collection.description,
      libraries: collection.libraries || [],
    };
  },
});

/**
 * Admin only: imports a library of a file, owned by the admin. A library
 * already here is skipped, or with `replace` loses its nodes for the file's,
 * keeping its owner, sharing and subscribers. `makePublic` lists a new library
 * in the community libraries.
 */
export const importLibrary = new ValidatedMethod({
  name: 'libraries.import',
  validate: new SimpleSchema({
    library: Object,
    'library._id': { type: String, max: 32 },
    'library.name': { type: String, min: 1, max: STORAGE_LIMITS.name },
    'library.description': { type: String, optional: true, max: STORAGE_LIMITS.summary },
    nodes: { type: Array, maxCount: MAX_IMPORTED_NODES },
    'nodes.$': { type: Object, blackbox: true },
    replace: { type: Boolean, optional: true },
    makePublic: { type: Boolean, optional: true },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ library, nodes, replace = false, makePublic = false }) {
    await assertCanCreateLibrary(this.userId);
    if (Meteor.isClient) return;
    const prepared = prepareImportedNodes(nodes, library._id);
    const raw = LibraryNodes.rawCollection();
    const existing = await Libraries.findOneAsync(library._id, { fields: { _id: 1 } });
    if (existing && !replace) return { status: 'skipped', nodes: 0 };

    if (existing) {
      const previous = await raw.find({ 'root.id': library._id }).toArray();
      await raw.deleteMany({ 'root.id': library._id });
      try {
        await insertNodes(prepared);
      } catch (e) {
        // The library as it was
        await raw.deleteMany({ 'root.id': library._id });
        if (previous.length) await raw.insertMany(previous, { ordered: false });
        throw new Meteor.Error('import-failed', `${library.name}: ${errorMessage(e)}. It was left as it was.`);
      }
      await Libraries.updateAsync(library._id, library.description
        ? { $set: { name: library.name, description: library.description } }
        : { $set: { name: library.name }, $unset: { description: 1 } });
    } else {
      await Libraries.insertAsync({
        _id: library._id,
        name: library.name,
        ...library.description && { description: library.description },
        owner: this.userId,
        readers: [],
        writers: [],
        public: makePublic,
        showInMarket: makePublic,
        subscriberCount: 0,
      });
      try {
        await insertNodes(prepared);
      } catch (e) {
        // Nothing half imported. The nodes of other libraries that share an
        // id with the file's are not this library's: they stay
        await raw.deleteMany({ 'root.id': library._id });
        await Libraries.removeAsync(library._id);
        throw new Meteor.Error('import-failed', `${library.name}: ${errorMessage(e)}. Nothing was imported.`);
      }
    }
    await rebuildNestedSets(LibraryNodes, library._id);
    return { status: existing ? 'replaced' : 'imported', nodes: prepared.length };
  },
});

/**
 * Admin only: the collection of a file, holding those of its libraries that
 * are here. Skipped when it is already here, unless `replace`, which updates
 * its name, description and libraries.
 */
export const importLibraryCollection = new ValidatedMethod({
  name: 'libraryCollections.import',
  validate: new SimpleSchema({
    collection: Object,
    'collection._id': { type: String, max: 32 },
    'collection.name': { type: String, optional: true, max: STORAGE_LIMITS.name },
    'collection.description': { type: String, optional: true, max: STORAGE_LIMITS.summary },
    'collection.libraries': { type: Array, maxCount: STORAGE_LIMITS.libraryCollectionCount },
    'collection.libraries.$': { type: String, max: 32 },
    replace: { type: Boolean, optional: true },
    makePublic: { type: Boolean, optional: true },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ collection, replace = false, makePublic = false }) {
    await assertCanCreateLibrary(this.userId);
    if (Meteor.isClient) return;
    const libraries = await Libraries.find(
      { _id: { $in: collection.libraries } }, { fields: { _id: 1 } },
    ).mapAsync(library => library._id);
    // In the file's order
    const present = collection.libraries.filter(id => libraries.includes(id));
    const existing = await LibraryCollections.findOneAsync(collection._id, { fields: { _id: 1 } });
    if (existing && !replace) return { status: 'skipped' };
    const fields = {
      name: collection.name,
      ...collection.description && { description: collection.description },
      libraries: present,
    };
    if (existing) {
      await LibraryCollections.updateAsync(collection._id, { $set: fields });
      return { status: 'replaced' };
    }
    await LibraryCollections.insertAsync({
      _id: collection._id,
      ...fields,
      owner: this.userId,
      readers: [],
      writers: [],
      public: makePublic,
      showInMarket: makePublic,
      subscriberCount: 0,
    });
    return { status: 'imported' };
  },
});
