import { assert } from 'chai';
import {
  estimateMonthlyStorageCost, getPricePerGB, parseCustomPricePerGB,
} from '/imports/api/files/s3Pricing';

const GB = 1024 ** 3;

describe('S3 storage pricing', function () {
  describe('estimateMonthlyStorageCost', function () {
    it('costs nothing for no files', function () {
      assert.equal(estimateMonthlyStorageCost(0), 0);
      assert.equal(estimateMonthlyStorageCost(-1), 0);
    });

    it('bills by the GB of 2^30 bytes', function () {
      assert.closeTo(estimateMonthlyStorageCost(GB), 0.024, 1e-12);
      assert.closeTo(estimateMonthlyStorageCost(10 * GB), 0.24, 1e-12);
      assert.closeTo(estimateMonthlyStorageCost(GB / 2), 0.012, 1e-12);
    });

    it('lowers the price per GB with each tier', function () {
      // The first 50 TB at 0.024, the next 10 TB at 0.023
      assert.closeTo(
        estimateMonthlyStorageCost(60 * 1024 * GB),
        50 * 1024 * 0.024 + 10 * 1024 * 0.023,
        1e-6,
      );
      // 500 TB in all, then 100 TB beyond them at 0.022
      assert.closeTo(
        estimateMonthlyStorageCost(600 * 1024 * GB),
        50 * 1024 * 0.024 + 450 * 1024 * 0.023 + 100 * 1024 * 0.022,
        1e-6,
      );
    });

    it('applies a custom price to every GB', function () {
      assert.closeTo(estimateMonthlyStorageCost(60 * 1024 * GB, 0.03), 60 * 1024 * 0.03, 1e-6);
      assert.equal(estimateMonthlyStorageCost(GB, 0), 0);
    });
  });

  describe('getPricePerGB', function () {
    it('is the price of the first tier, or the custom one', function () {
      assert.equal(getPricePerGB(), 0.024);
      assert.equal(getPricePerGB(0.05), 0.05);
      assert.equal(getPricePerGB(0), 0);
    });
  });

  describe('parseCustomPricePerGB', function () {
    it('only accepts a finite price that is not negative', function () {
      assert.equal(parseCustomPricePerGB(0.025), 0.025);
      assert.equal(parseCustomPricePerGB(0), 0);
      assert.isUndefined(parseCustomPricePerGB(undefined));
      assert.isUndefined(parseCustomPricePerGB('0.025'));
      assert.isUndefined(parseCustomPricePerGB(-1));
      assert.isUndefined(parseCustomPricePerGB(NaN));
      assert.isUndefined(parseCustomPricePerGB(Infinity));
    });
  });
});
