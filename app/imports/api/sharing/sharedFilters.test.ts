import { assert } from 'chai';
import { readableBy, sharedWith } from '/imports/api/sharing/sharedFilters';

describe('Selectors of the documents a user may see', function () {
  it('shared with the user: owned, writable or readable', function () {
    assert.deepEqual(sharedWith('u1'), [{ owner: 'u1' }, { writers: 'u1' }, { readers: 'u1' }]);
  });

  it('readable: shared, or public', function () {
    assert.deepEqual(readableBy('u1'), {
      $or: [{ owner: 'u1' }, { writers: 'u1' }, { readers: 'u1' }, { public: true }],
    });
  });

  it('readable: shared, or public among the given ids only', function () {
    assert.deepEqual(readableBy('u1', ['lib1']).$or.at(-1), { _id: { $in: ['lib1'] }, public: true });
  });

  // `{ writers: null }` matches the documents without the field
  it('signed out: the public documents alone, no branch that matches null', function () {
    assert.deepEqual(readableBy(null), { $or: [{ public: true }] });
    assert.deepEqual(readableBy(undefined, ['lib1']), { $or: [{ _id: { $in: ['lib1'] }, public: true }] });
  });
});
