import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import { assertCanManageRoles } from '/imports/api/users/assertRolePermissions';

export type CollectionUsage = {
  name: string,
  documentCount: number,
  // The documents' size uncompressed, as the app reads them
  dataSize: number,
  // What the collection takes on disk: its compressed documents and its indexes
  totalSize: number,
  indexSize: number,
};

export type DatabaseUsage = {
  name: string,
  collectionCount: number,
  documentCount: number,
  dataSize: number,
  // On disk: the compressed documents (storageSize) and the indexes (indexSize)
  storageSize: number,
  indexSize: number,
  totalSize: number,
  // The disk holding the database, all files included, when MongoDB reports it
  fsUsedSize?: number,
  fsTotalSize?: number,
  // Largest first
  collections: CollectionUsage[],
  // Why the size of some collections couldn't be read
  collectionsError?: string,
};

async function getCollectionUsage(db: any, name: string): Promise<CollectionUsage> {
  // One document per shard on a sharded cluster, a single one otherwise
  const shards = await db.collection(name).aggregate([
    { $collStats: { storageStats: {} } },
  ]).toArray();
  const usage = { name, documentCount: 0, dataSize: 0, totalSize: 0, indexSize: 0 };
  for (const { storageStats: stats = {} } of shards) {
    const storageSize = stats.storageSize || 0;
    const indexSize = stats.totalIndexSize || 0;
    usage.documentCount += stats.count || 0;
    usage.dataSize += stats.size || 0;
    usage.indexSize += indexSize;
    usage.totalSize += stats.totalSize ?? storageSize + indexSize;
  }
  return usage;
}

async function getCollectionsUsage(db: any) {
  const collections = await db.listCollections({ type: 'collection' }, { nameOnly: true }).toArray();
  const results = await Promise.allSettled(collections
    .map(({ name }) => name as string)
    .filter(name => !name.startsWith('system.'))
    .map(name => getCollectionUsage(db, name)));
  const usage: CollectionUsage[] = [];
  let error: string | undefined;
  for (const result of results) {
    if (result.status === 'fulfilled') {
      usage.push(result.value);
    } else {
      console.error('Could not read the size of a collection', result.reason);
      error ??= result.reason?.message || String(result.reason);
    }
  }
  usage.sort((a, b) => b.totalSize - a.totalSize || a.name.localeCompare(b.name));
  return { usage, error };
}

/**
 * Admin only: how much space the app's MongoDB database takes, in all and by
 * collection, and how full the disk holding it is. The app's database user
 * reads these with the dbStats and collStats actions of its readWrite role.
 */
const getDatabaseUsage = new ValidatedMethod({
  name: 'admin.getDatabaseUsage',
  validate: null,
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run(): Promise<DatabaseUsage | undefined> {
    if (Meteor.isClient) return;
    await assertCanManageRoles(this.userId);

    const db = Meteor.users.rawDatabase();
    const [stats, collections] = await Promise.all([
      db.command({ dbStats: 1 }),
      getCollectionsUsage(db).catch(error => {
        console.error('Could not list the collections', error);
        return { usage: [], error: error?.message || String(error) };
      }),
    ]);
    const storageSize = stats.storageSize || 0;
    const indexSize = stats.indexSize || 0;
    return {
      name: db.databaseName,
      collectionCount: stats.collections || 0,
      documentCount: stats.objects || 0,
      dataSize: stats.dataSize || 0,
      storageSize,
      indexSize,
      totalSize: stats.totalSize ?? storageSize + indexSize,
      fsUsedSize: stats.fsUsedSize || undefined,
      fsTotalSize: stats.fsTotalSize || undefined,
      collections: collections.usage,
      collectionsError: collections.error,
    };
  },
});

export default getDatabaseUsage;
