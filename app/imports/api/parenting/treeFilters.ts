import type { TreeDoc } from '/imports/api/parenting/ChildSchema';

/*
 * Query filters for the documents of a tree (nested sets): ancestors,
 * descendants, children, parent. Pure, and importing nothing of the app's, so
 * that the creatures' cache (loadCreatures) can use them without importing
 * the tree functions, which read the cache back: an import cycle otherwise
 * (tests/cycles). parentingFunctions exports them too.
 */

export const getFilter = {
  /**
   * 
   * @param doc A document or array of documents that share a root
   * @returns A query filter that finds all the ancestors of the doc(s)
   */
  ancestors(doc: TreeDoc) {
    return {
      'root.id': doc.root.id,
      left: { $lt: doc.left },
      right: { $gt: doc.right },
    };
  },
  ancestorsOfAll(docs: Array<TreeDoc>) {
    // The ancestors of no documents is a query that returns nothing
    if (docs.length === 0) {
      return { _id: '' };
    }
    // Fallback to the simpler filter for a single document
    if (docs.length === 1) {
      return getFilter.ancestors(docs[0]);
    }
    // Build a filter that selects all ancestors
    const filter = {
      'root.id': docs[0].root.id,
      $or: <object[]>[],
    };
    docs.forEach(doc => {
      filter.$or.push({
        left: { $lt: doc.left },
        right: { $gt: doc.right },
      });
    });
    return filter;
  },
  descendantsOfRoot(rootId: string) {
    return {
      'root.id': rootId,
    }
  },
  /**
   * The documents under any of the roots. Under no root, none: a user who can
   * see no library searches an empty list (searchLibraryNodes), rather than
   * every library or an exception
   */
  descendantsOfAllRoots(rootIds: string[]) {
    return {
      'root.id': { $in: rootIds },
    };
  },
  descendants(doc: TreeDoc) {
    return {
      'root.id': doc.root.id,
      left: { $gt: doc.left },
      right: { $lt: doc.right },
    };
  },
  descendantsOfAll(docs: Array<TreeDoc>) {
    // The descendants of no documents is a query that returns nothing
    if (docs.length === 0) {
      return { _id: '' };
    }
    // Fallback to the simpler filter for a single document
    if (docs.length === 1) {
      return getFilter.descendants(docs[0]);
    }
    // Build a filter that selects all descendants
    const filter = {
      'root.id': docs[0].root.id,
      $or: <{
        left: { $gt: number },
        right: { $lt: number },
      }[]>[],
    };
    docs.forEach(doc => {
      filter.$or.push({
        left: { $gt: doc.left },
        right: { $lt: doc.right },
      });
    });
    return filter;
  },
  children(doc: TreeDoc) {
    return {
      'root.id': doc.root.id,
      parentId: doc._id,
    };
  },
  parent(doc: TreeDoc) {
    return {
      _id: doc.parentId,
    };
  },
}
