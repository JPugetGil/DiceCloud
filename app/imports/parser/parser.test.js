import { parse } from '/imports/parser/parser';
import resolve from '/imports/parser/resolve';
import toString from './toString';
import { assert } from 'chai';

describe('Parser', function () {
  it('parses valid text without error', function () {
    assert.typeOf(parse('1'), 'object');
  });
  it('parses various operations', function () {
    assert.typeOf(parse('[1,2,3][2] + 1 + 2 * 3 / 4 * 1d8'), 'object');
  });
  it('simplifies basic addition and multiplication', async function () {
    let add = parse('1 + 3 + 3 + 4');
    ({ result: add } = await resolve('compile', add));
    assert.equal(toString(add), '11');

    let mul = parse('2 * 3 * 4');
    ({ result: mul } = await resolve('compile', mul));
    assert.equal(toString(mul), '24');
  });
  it('simplifies addition when possible, even if a roll is in the way', async function () {
    let { result } = await resolve('compile', parse('1 + 3 + d12 + 3 + 4'));
    assert.equal(toString(result), 'd12 + 11');
  });
  // Found by the properties (parser.property.test.ts): the printed formula
  // read as another one, or as none
  it('prints a negative number raised to a power in parentheses', async function () {
    const { result } = await resolve('compile', parse('bonus ^ floor(d4)'), { bonus: { value: -2 } });
    assert.equal(toString(result), '(-2) ^ floor(d4)');
    assert.equal(parse(toString(result)).parseType, 'operator');
  });
  it('keeps the d of a roll apart from a name beside it', function () {
    assert.equal(toString(parse('2d6 + d20')), '2d6 + d20');
    assert.equal(toString(parse('level d 6')), 'level d 6');
    assert.equal(toString(parse('2 d floor(d4)')), '2 d floor(d4)');
    assert.equal(toString(parse('d floor(d4)')), 'd floor(d4)');
    assert.deepEqual(parse(toString(parse('2 d floor(d4)'))), parse('2 d floor(d4)'));
  });
});
