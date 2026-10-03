import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import ArchiveCreatureFiles from '/imports/api/creature/archive/ArchiveCreatureFiles';
import UserImages from '/imports/api/files/userImages/UserImages';
import { APP_FILES_PREFIX, type PrefixUsage, summarizeUsage } from '/imports/api/files/bucketUsage';
import {
  DEFAULT_S3_REGION, S3_PRICE_CURRENCY, estimateMonthlyStorageCost, getPricePerGB,
  parseCustomPricePerGB,
} from '/imports/api/files/s3Pricing';
import { assertCanManageRoles } from '/imports/api/users/assertRolePermissions';

let getBucketUsage: (() => Promise<PrefixUsage[]>) | undefined;
if (Meteor.isServer) {
  // require(), not import: the client calls this method, and a static import
  // would bundle the AWS SDK into it
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ({ getBucketUsage } = require('/imports/api/files/server/s3FileStorage'));
}

export type S3Usage = {
  // Whether the files are on S3. If not, the figures are what the files on the
  // server's disk would take, and cost, on S3
  useS3: boolean,
  // 'bucket': every object of the bucket, whatever stored it. 'database': only
  // the app's files recorded in the database the app is connected to
  source: 'bucket' | 'database',
  // Why the bucket couldn't be listed, when it should have been
  listingError?: { accessDenied: boolean, message: string },
  bucket?: string,
  region: string,
  // Bytes of the objects, how many there are, and the same by top-level folder
  bytes: number,
  objectCount: number,
  prefixes: PrefixUsage[],
  pricePerGB: number,
  monthlyCost: number,
  currency: string,
};

/**
 * Size of the files' versions kept on S3 (all of them when `onlyOnS3` is
 * false). A version is on S3 once its meta holds the path of its object.
 */
async function sumVersions(collection: any, onlyOnS3: boolean) {
  const [total] = await collection.collection.rawCollection().aggregate([
    { $project: { versions: { $objectToArray: { $ifNull: ['$versions', {}] } } } },
    { $unwind: '$versions' },
    ...(onlyOnS3 ? [{ $match: { 'versions.v.meta.pipePath': { $type: 'string' } } }] : []),
    {
      $group: {
        _id: null,
        bytes: { $sum: '$versions.v.size' },
        objectCount: { $sum: 1 },
      },
    },
  ]).toArray();
  return { bytes: total?.bytes || 0, objectCount: total?.objectCount || 0 };
}

/** The app's files recorded in the database, as the bucket's `files/` folder */
async function getRecordedFilesUsage(onlyOnS3: boolean): Promise<PrefixUsage[]> {
  const totals = await Promise.all(
    [ArchiveCreatureFiles, UserImages].map(collection => sumVersions(collection, onlyOnS3))
  );
  const objectCount = totals.reduce((sum, total) => sum + total.objectCount, 0);
  if (!objectCount) return [];
  const bytes = totals.reduce((sum, total) => sum + total.bytes, 0);
  return [{ prefix: APP_FILES_PREFIX, bytes, objectCount }];
}

/**
 * Admin only: how much space the S3 bucket takes, by top-level folder, and what
 * that costs a month. Listing the bucket counts everything stored there, such
 * as the database backups, and doesn't depend on which database the app uses.
 * When the access key can't list it, only the app's files recorded in the
 * database are counted.
 */
const getS3Usage = new ValidatedMethod({
  name: 'admin.getS3Usage',
  validate: null,
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run(): Promise<S3Usage | undefined> {
    if (Meteor.isClient) return;
    await assertCanManageRoles(this.userId);

    const useS3 = !!Meteor.settings.useS3;
    let source: S3Usage['source'] = 'database';
    let listingError: S3Usage['listingError'];
    let prefixes: PrefixUsage[] | undefined;
    if (useS3 && getBucketUsage) {
      try {
        prefixes = await getBucketUsage();
        source = 'bucket';
      } catch (e: any) {
        console.error('Could not list the S3 bucket', e);
        listingError = {
          accessDenied: e?.name === 'AccessDenied' || e?.$metadata?.httpStatusCode === 403,
          message: e?.message || String(e),
        };
      }
    }
    prefixes ??= await getRecordedFilesUsage(useS3);
    const usage = summarizeUsage(prefixes);

    const customPricePerGB = parseCustomPricePerGB(Meteor.settings.s3?.storagePricePerGB);
    return {
      useS3,
      source,
      listingError,
      bucket: useS3 ? Meteor.settings.s3?.bucket : undefined,
      region: Meteor.settings.s3?.region || DEFAULT_S3_REGION,
      ...usage,
      pricePerGB: getPricePerGB(customPricePerGB),
      monthlyCost: estimateMonthlyStorageCost(usage.bytes, customPricePerGB),
      currency: S3_PRICE_CURRENCY,
    };
  },
});

export default getS3Usage;
