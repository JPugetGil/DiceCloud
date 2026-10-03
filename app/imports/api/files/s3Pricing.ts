/**
 * Estimate of what the files cost to store on AWS S3. Only the storage is
 * priced: requests and data transfer depend on how the files are used.
 */

export const S3_PRICE_CURRENCY = 'USD';

// The AWS region of the bucket unless the settings name another (Paris)
export const DEFAULT_S3_REGION = 'eu-west-3';

// AWS bills by the "GB" of 2^30 bytes
const BYTES_PER_GB = 1024 ** 3;

/**
 * S3 Standard storage in Paris (DEFAULT_S3_REGION), the region the app uses
 * unless the settings name another, in USD per GB and month. `upToGB` ends each tier.
 * Source: AWS price list, September 2026. For another region or a negotiated
 * rate, set `s3.storagePricePerGB` in the settings.
 */
const PARIS_STANDARD_TIERS = [
  { upToGB: 50 * 1024, pricePerGB: 0.024 },
  { upToGB: 500 * 1024, pricePerGB: 0.023 },
  { upToGB: Infinity, pricePerGB: 0.022 },
] as const;

/** The custom price per GB and month from the settings, if it is a valid one */
export function parseCustomPricePerGB(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return;
  return value;
}

/** The price per GB and month of the first tier, or the custom flat price */
export function getPricePerGB(customPricePerGB?: number): number {
  return customPricePerGB ?? PARIS_STANDARD_TIERS[0].pricePerGB;
}

/**
 * What storing `bytes` for a month costs in USD, as if the volume stayed the
 * same all month long. A custom price applies to every GB.
 */
export function estimateMonthlyStorageCost(bytes: number, customPricePerGB?: number): number {
  const gigabytes = Math.max(bytes, 0) / BYTES_PER_GB;
  if (customPricePerGB !== undefined) return gigabytes * customPricePerGB;
  let cost = 0;
  let tierStart = 0;
  for (const { upToGB, pricePerGB } of PARIS_STANDARD_TIERS) {
    if (gigabytes <= tierStart) break;
    cost += (Math.min(gigabytes, upToGB) - tierStart) * pricePerGB;
    tierStart = upToGB;
  }
  return cost;
}
