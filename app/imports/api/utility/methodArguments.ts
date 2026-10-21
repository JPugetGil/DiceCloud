import { check, Match } from 'meteor/check';

/*
 * Checks of the arguments of the methods that take them without a schema.
 * An id from the client must be a string: given an object, `findOneAsync(_id)`
 * and `removeAsync(_id)` take it as a selector, the permission is checked on
 * the first document it finds and the write reaches every one it matches
 * (`{ _id: { $in: [mine, theirs] } }` removed another user's party).
 */

/** A document id: a string of at most 32 characters */
export function checkId(id: unknown): asserts id is string {
  check(id, Match.Where(value => typeof value === 'string' && value.length > 0 && value.length <= 32));
}

/** A path into a document: keys and array indices, none an operator */
export function checkPath(path: unknown): asserts path is (string | number)[] {
  check(path, [Match.OneOf(String, Match.Integer)]);
  check(path, Match.Where(keys => (keys as (string | number)[])
    .every(key => typeof key === 'number' || (key.length > 0 && !key.startsWith('$')))));
}
