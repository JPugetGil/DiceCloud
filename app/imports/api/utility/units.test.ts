import { assert } from 'chai';
import {
  getAttributeUnit, getEffectUnit, getDisplayUnit, toDisplayValue, fromDisplayValue,
} from '/imports/api/utility/units';

const imperial = { distanceUnit: 'ft', weightUnit: 'lb' };

describe('Units', function () {
  describe('getAttributeUnit', function () {
    it('takes the unit from the variable name by default', function () {
      assert.equal(getAttributeUnit({ variableName: 'speed' }), 'distance');
      assert.equal(getAttributeUnit({ variableName: 'darkvisionRange' }), 'distance');
      assert.equal(getAttributeUnit({ variableName: 'carryingCapacity' }), 'weight');
      assert.equal(getAttributeUnit({ variableName: 'strength' }), undefined);
      assert.equal(getAttributeUnit(undefined), undefined);
    });
    it('lets the attribute set its own unit, or none', function () {
      assert.equal(getAttributeUnit({ variableName: 'strideLength', unit: 'distance' }), 'distance');
      assert.equal(getAttributeUnit({ variableName: 'speed', unit: 'none' }), undefined);
      assert.equal(getAttributeUnit({ variableName: 'speed', unit: 'weight' }), 'weight');
    });
  });

  describe('getEffectUnit', function () {
    it('takes the unit of the stats an effect changes', function () {
      assert.equal(getEffectUnit({ operation: 'base', stats: ['speed', 'unmodifiedSpeed'] }), 'distance');
      assert.equal(getEffectUnit({ operation: 'add', stats: ['flySpeed'] }), 'distance');
      // Extended Reach: a stat no attribute defines
      assert.equal(getEffectUnit({ operation: 'add', stats: ['reach'] }), 'distance');
    });
    it('converts no factor, and no stats of mixed units', function () {
      assert.equal(getEffectUnit({ operation: 'mul', stats: ['speed'] }), undefined);
      assert.equal(getEffectUnit({ operation: 'add', stats: ['speed', 'strength'] }), undefined);
      assert.equal(getEffectUnit({ operation: 'add', stats: ['speed'], targetByTags: true }), undefined);
    });
    it('prefers the unit the creature\'s attribute sets', function () {
      const findAttribute = name => name === 'speed' ? { variableName: 'speed', unit: 'none' } : undefined;
      assert.equal(getEffectUnit({ operation: 'base', stats: ['speed'] }, findAttribute), undefined);
    });
  });

  describe('conversions', function () {
    it('shows metric by default', function () {
      assert.equal(getDisplayUnit('distance', undefined), 'm');
      assert.equal(getDisplayUnit('weight', {}), 'kg');
      assert.equal(toDisplayValue(9, 'distance', undefined), 9);
    });
    it('uses the D&D rules: 1.5 m = 5 ft, 1 lb = 0.5 kg', function () {
      assert.equal(toDisplayValue(9, 'distance', imperial), 30);
      assert.equal(toDisplayValue(1.5, 'distance', imperial), 5);
      assert.equal(toDisplayValue(4.2, 'distance', imperial), 14);
      assert.equal(toDisplayValue(5, 'weight', imperial), 10);
      assert.equal(toDisplayValue(0.025, 'weight', imperial), 0.05);
    });
    it('converts typed values back without losing precision', function () {
      assert.equal(fromDisplayValue(30, 'distance', imperial), 9);
      assert.equal(fromDisplayValue(5, 'distance', imperial), 1.5);
      assert.equal(fromDisplayValue(0.05, 'weight', imperial), 0.025);
      assert.equal(fromDisplayValue(3, 'weight', { weightUnit: 'kg' }), 3);
    });
  });
});
