import { assert } from 'chai';
import { withTotals } from '/imports/ui/log/logTotals';

describe('Log totals', function () {
  it('takes a roll\'s result off its last line', function () {
    assert.deepEqual(withTotals([
      { name: 'To hit', value: '1d20 [ 13 ] +5\n**18**' },
    ]), [
      { name: 'To hit', value: '1d20 [ 13 ] +5', total: '18', totalLabel: undefined },
    ]);
  });

  it('keeps the words after the result beside it', function () {
    const [line] = withTotals([{ name: 'Damage', value: '1d8 [ 5 ] + 3\n**8** slashing damage' }]);
    assert.equal(line.total, '8');
    assert.equal(line.totalLabel, 'slashing damage');
    assert.equal(line.value, '1d8 [ 5 ] + 3');
  });

  it('heads a constant result too, and writes a negative one with a minus sign', function () {
    assert.deepEqual(withTotals([{ name: 'Roll', value: '**-2**' }]), [
      { name: 'Roll', value: undefined, total: '−2', totalLabel: undefined },
    ]);
  });

  it('leaves a line whose bold is not its result alone', function () {
    const lines = [
      { name: 'Short rest', value: 'Nothing to restore' },
      { name: 'Hit Dice', value: 'Hit Dice **+1** (3/4)' },
      { name: 'Damage', value: '**8** fire, **4** cold' },
    ];
    assert.deepEqual(withTotals(lines), lines);
  });

  it('heads a typed roll with its result, given on its last line', function () {
    assert.deepEqual(withTotals([
      { value: '1d20 + 4' },
      { value: '1d20 [ 15 ] + 4' },
      { value: '19' },
    ]), [
      { value: '1d20 + 4', total: '19' },
      { value: '1d20 [ 15 ] + 4', detail: true },
    ]);
  });

  it('does not take a named line\'s value for a typed roll\'s result', function () {
    const lines = [{ value: '1d6 [ 4 ]' }, { name: 'Note', value: '3' }];
    assert.deepEqual(withTotals(lines), lines);
  });
});
