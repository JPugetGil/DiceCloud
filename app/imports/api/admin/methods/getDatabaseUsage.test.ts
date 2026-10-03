import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import getDatabaseUsage, { type DatabaseUsage } from '/imports/api/admin/methods/getDatabaseUsage';

describe('Database usage', function () {
  const adminId = Random.id();
  const playerId = Random.id();
  const as = (userId?: string) =>
    (getDatabaseUsage as any)._execute({ userId }, {}) as Promise<DatabaseUsage>;

  before(async function () {
    if (!Meteor.isServer) this.skip();
    await Meteor.users.rawCollection().insertMany([
      { _id: adminId, createdAt: new Date(), roles: ['admin'] },
      { _id: playerId, createdAt: new Date() },
    ] as any[]);
  });

  after(async function () {
    if (!Meteor.isServer) return;
    await Meteor.users.removeAsync({ _id: { $in: [adminId, playerId] } });
  });

  it('is only for admins', async function () {
    for (const userId of [playerId, undefined]) {
      let error;
      try {
        await as(userId);
      } catch (e) {
        error = e;
      }
      assert.exists(error, `refused to ${userId || 'logged out users'}`);
    }
  });

  it('reports the size of the database and of each collection, largest first', async function () {
    const usage = await as(adminId);
    assert.equal(usage.name, Meteor.users.rawDatabase().databaseName);
    assert.isAbove(usage.totalSize, 0);
    assert.equal(usage.totalSize, usage.storageSize + usage.indexSize);
    assert.isAtLeast(usage.documentCount, 2);
    assert.isUndefined(usage.collectionsError);

    const users = usage.collections.find(collection => collection.name === 'users');
    assert.exists(users);
    assert.isAtLeast(users!.documentCount, 2);
    assert.isAbove(users!.dataSize, 0);
    assert.isAbove(users!.totalSize, 0);
    assert.isFalse(usage.collections.some(collection => collection.name.startsWith('system.')));

    const sizes = usage.collections.map(collection => collection.totalSize);
    assert.deepEqual(sizes, [...sizes].sort((a, b) => b - a));
  });
});
