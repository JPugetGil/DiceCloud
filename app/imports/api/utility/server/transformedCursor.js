/**
 * A cursor whose documents' fields go through `transform` before
 * reactivePublication sends them: what a projection cannot do, such as
 * leaving out a field of some elements of an array. Its observers see the
 * cursor's top-level fields (a changed field comes whole), as the mergebox
 * does. reactivePublication only: Meteor's own publishing would bypass the
 * transform, so the cursor refuses it.
 * @param {any} cursor A Mongo cursor
 * @param {(fields: Record<string, any>, id: any) => Record<string, any>} transform
 *   Called with an added document's fields, or a change's, and its id
 */
export default function transformedCursor(cursor, transform) {
  return {
    _getCollectionName: () => cursor._getCollectionName(),
    _publishCursor() {
      throw new Error('A transformed cursor is published by reactivePublication only');
    },
    observeChanges(callbacks, options) {
      return cursor.observeChanges({
        added: (id, fields) => callbacks.added?.(id, transform(fields, id)),
        changed: (id, fields) => callbacks.changed?.(id, transform(fields, id)),
        removed: id => callbacks.removed?.(id),
      }, options);
    },
  };
}
