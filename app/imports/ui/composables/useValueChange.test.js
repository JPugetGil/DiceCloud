import { assert } from 'chai';
import { createChangeBatch, BURST } from '/imports/ui/composables/useValueChange';

describe('Recalculated values (useValueChange)', function () {
  it('flashes each value of a small batch with its direction', function () {
    const batch = createChangeBatch();
    batch.report('armor.value', 'up');
    batch.report('dexterity.modifier', 'down');
    const { flashes, summary } = batch.flush();
    assert.isUndefined(summary);
    assert.deepEqual([...flashes], [['armor.value', 'up'], ['dexterity.modifier', 'down']]);
  });

  it('counts a value once, with its latest direction', function () {
    const batch = createChangeBatch();
    batch.report('armor.value', 'up');
    batch.report('armor.value', 'down');
    assert.deepEqual([...batch.flush().flashes], [['armor.value', 'down']]);
  });

  it(`sums up more than ${BURST} changes at once, and starts afresh`, function () {
    const batch = createChangeBatch();
    for (let i = 0; i <= BURST; i++) batch.report(`skill${i}.value`, 'up');
    const { flashes, summary } = batch.flush();
    assert.equal(summary, BURST + 1);
    assert.equal(flashes.size, 0);
    assert.equal(batch.size, 0);
    batch.report('armor.value', 'up');
    assert.equal(batch.flush().flashes.size, 1);
  });
});
