import { Meteor } from 'meteor/meteor';
import type { Mongo } from 'meteor/mongo';

export type IndexSpec = {
  key: Record<string, 1 | -1>,
  name?: string,
  partialFilterExpression?: Record<string, unknown>,
};

/**
 * The index of every tree query (treeFilters): a root's documents in tree
 * order, a subtree as one range of it. Every query on `left` or `right` has its
 * root, so it replaces the indexes of `root.id`, `left` and `right` alone
 */
export const TREE_INDEX: IndexSpec = { key: { 'root.id': 1, left: 1 } };

/**
 * The indexes the shared schemas declared (aldeed:schema-index names them
 * c2_<field>), dropped once the tree index exists. `removed` is true for a few
 * documents and missing for all others: for `removed: { $ne: true }` the
 * planner chose it and read the whole collection (conditions.list: 343 ms for
 * 17 conditions; 1 ms with the library's own indexes)
 */
export const SCHEMA_INDEXES = ['c2_root.id', 'c2_left', 'c2_right', 'c2_removed'];

const updates: Promise<void>[] = [];

/**
 * Builds the tree index and `indexes`, then drops the indexes they replace
 * (`SCHEMA_INDEXES` and `dropped`): the collection is never left without an
 * index on the root. Building an index that exists does nothing
 */
export async function updateTreeIndexes(
  collection: Mongo.Collection<any>,
  { indexes = [], dropped = [] }: { indexes?: IndexSpec[], dropped?: string[] } = {},
) {
  const raw = collection.rawCollection();
  for (const { key, ...options } of [TREE_INDEX, ...indexes]) await raw.createIndex(key, options);
  const existing = new Set((await raw.indexes()).map(index => index.name));
  for (const name of [...SCHEMA_INDEXES, ...dropped]) {
    if (existing.has(name)) await raw.dropIndex(name);
  }
}

/** A tree collection's indexes, updated on the server at startup */
export function declareTreeIndexes(collection: Mongo.Collection<any>, options?: Parameters<typeof updateTreeIndexes>[1]) {
  if (!Meteor.isServer) return;
  updates.push(new Promise<void>(resolve => Meteor.startup(() => resolve()))
    .then(() => updateTreeIndexes(collection, options))
    .catch(error => console.error(`The indexes of ${collection.rawCollection().collectionName} were not updated`, error)));
}

/** Resolves once every tree collection's indexes are updated */
export function treeIndexesUpdated() {
  return Promise.all(updates);
}
