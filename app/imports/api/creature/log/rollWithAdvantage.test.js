import { assert } from 'chai';
import rollWithAdvantage from '/imports/api/creature/log/rollWithAdvantage';

describe('Rolls with advantage', function () {
  it('turns the first d20 into two, dropping the lower or the higher', function () {
    assert.equal(rollWithAdvantage('1d20+4', 1), 'dropLowest(2d20)+4');
    assert.equal(rollWithAdvantage('d20 + strengthMod', -1), 'dropHighest(2d20) + strengthMod');
    assert.equal(rollWithAdvantage('1d20 + 1d20', 1), 'dropLowest(2d20) + 1d20');
  });

  it('leaves a roll alone without advantage, or without a single d20', function () {
    assert.equal(rollWithAdvantage('1d20+4', 0), '1d20+4');
    assert.equal(rollWithAdvantage('2d6+3', 1), '2d6+3');
    assert.equal(rollWithAdvantage('2d20', 1), '2d20');
    assert.equal(rollWithAdvantage('1d200', 1), '1d200');
    assert.equal(rollWithAdvantage('d20Bonus + 2', 1), 'd20Bonus + 2');
  });
});
