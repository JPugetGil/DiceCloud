import { assert } from 'chai';
import fc from 'fast-check';
import { fromDisplayValue, toDisplayValue } from '/imports/api/utility/units';
import type { Quantity } from '/imports/api/utility/units';

/*
 * The conversions between the stored metric values and the units a user
 * reads, on random values: what a user types reads back as typed, the
 * distances of the rules (whole feet) survive the trip both ways, and the
 * conversion keeps the order of values.
 */
const numRuns = Number(process.env.FC_NUM_RUNS) || 500;
const imperial = { distanceUnit: 'ft', weightUnit: 'lb' };
const metric = { distanceUnit: 'm', weightUnit: 'kg' };
const quantity = fc.constantFrom<Quantity>('distance', 'weight');
// A value as a user types it: up to 3 decimals, as the fields show them
const typed = fc.integer({ min: -10_000_000, max: 10_000_000 }).map(thousandths => thousandths / 1000);

describe('Units (properties)', function () {
  it('read back a typed value as the user typed it', function () {
    fc.assert(fc.property(typed, quantity, (value, q) => {
      const stored = fromDisplayValue(value, q, imperial);
      assert.equal(toDisplayValue(stored, q, imperial), value, `${value} stored as ${stored}`);
    }), { numRuns });
  });

  it('show a whole number of feet, or of pounds, and store it back unchanged', function () {
    fc.assert(fc.property(fc.integer({ min: -100_000, max: 100_000 }), quantity, (whole, q) => {
      // 1 ft = 0.3 m, 1 lb = 0.5 kg: the metric value the libraries store
      const stored = Math.round(whole * (q === 'distance' ? 0.3 : 0.5) * 1e6) / 1e6;
      const shown = toDisplayValue(stored, q, imperial);
      assert.equal(shown, whole);
      assert.equal(fromDisplayValue(shown, q, imperial), stored);
    }), { numRuns });
  });

  it('keep the order of values', function () {
    fc.assert(fc.property(typed, typed, quantity, (a, b, q) => {
      const [low, high] = a <= b ? [a, b] : [b, a];
      assert.isAtMost(toDisplayValue(low, q, imperial), toDisplayValue(high, q, imperial));
      assert.isAtMost(fromDisplayValue(low, q, imperial), fromDisplayValue(high, q, imperial));
    }), { numRuns });
  });

  it('change nothing in metric', function () {
    fc.assert(fc.property(fc.double({ noNaN: true }), quantity, (value, q) => {
      assert.equal(toDisplayValue(value, q, metric), value);
      assert.equal(fromDisplayValue(value, q, metric), value);
      assert.equal(toDisplayValue(value, q, undefined), value);
    }), { numRuns });
  });
});
