import type { TreeDoc, Reference } from '/imports/api/parenting/ChildSchema';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';

/*
 * A document by its reference ({ collection, id }), from any collection.
 * Imports nothing of the app's, so that what only needs a document by its
 * reference (sharingPermissions) does not import the tree functions, which
 * read the creatures (loadCreatures) and close an import cycle through the
 * engine (tests/cycles). parentingFunctions exports them too.
 */

// Any collection, by a name only known at run time: its documents are typed
// by the caller that knows which collection it names
export function getCollectionByName<T extends Record<string, any> = any>(name: string): Mongo.Collection<T> {
  const collection = Mongo.Collection.get<T>(name)
  if (!collection) {
    throw new Meteor.Error('bad-collection-reference',
      `Parent references collection ${name}, which does not exist`
    );
  }
  return collection;
}

function assertDocFound(doc, ref) {
  if (!doc) {
    throw new Meteor.Error('document-not-found',
      `No document could be found with id: ${ref.id} in ${ref.collection}`
    );
  }
}

// fetchDocByRef is async itself now; this name is kept for existing callers.
export function fetchDocByRefAsync<T extends Record<string, any> = TreeDoc>(ref: Reference, options?: Mongo.Options<object>): Promise<T> {
  return fetchDocByRef<T>(ref, options);
}

export async function fetchDocByRef<T extends Record<string, any> = TreeDoc>(ref: Reference, options?: Mongo.Options<object>): Promise<T> {
  const doc: T = await getCollectionByName<T>(ref.collection).findOneAsync(ref.id, options);
  assertDocFound(doc, ref);
  return doc;
}
