import { assert } from 'chai';
import resultLimit, { MAX_RESULTS } from '/imports/api/library/server/publications/resultLimit';

describe('Library searches\' result limit', function () {
  it('publishes what the client asks, within bounds', function () {
    assert.equal(resultLimit(100, 50), 100);
    assert.equal(resultLimit(undefined, 50), 50);
    assert.equal(resultLimit('lots', 50), 50);
    assert.equal(resultLimit(1e9, 50), MAX_RESULTS, 'never the whole library at once');
    assert.equal(resultLimit(-5, 50), 1);
    assert.equal(resultLimit(12.7, 50), 12);
  });
});
