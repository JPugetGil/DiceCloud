import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import ArchiveCreatureFiles from '/imports/api/creature/archive/ArchiveCreatureFiles';
import UserImages from '/imports/api/files/userImages/UserImages';
import getS3Usage, { type S3Usage } from '/imports/api/files/methods/getS3Usage';
import { estimateMonthlyStorageCost } from '/imports/api/files/s3Pricing';

/*
 * The admin page's storage figures, without S3 (the tests' settings): every
 * version of the app's files recorded in the database, and what they would
 * cost on S3. Listing a real bucket is not tested here.
 */
const [adminId, playerId] = [Random.id(), Random.id()];
const usage = (userId: string) =>
  (getS3Usage as unknown as { _execute(invocation: object, args: object): Promise<S3Usage> })._execute({ userId }, {});
const raw = (files: unknown) => (files as { collection: { rawCollection(): any } }).collection.rawCollection();
const imageId = Random.id();
const archiveId = Random.id();

if (Meteor.isServer) describe('Storage usage', function () {
  before(async function () {
    await Meteor.users.insertAsync({ _id: adminId, username: `admin-${adminId}`, roles: ['admin'] });
    await Meteor.users.insertAsync({ _id: playerId, username: `player-${playerId}` });
  });

  after(async function () {
    await raw(UserImages).deleteOne({ _id: imageId });
    await raw(ArchiveCreatureFiles).deleteOne({ _id: archiveId });
    await Meteor.users.removeAsync({ _id: { $in: [adminId, playerId] } });
  });

  it('is for admins only', async function () {
    let error: any;
    try {
      await usage(playerId);
    } catch (e) {
      error = e;
    }
    assert.equal(error?.error, 'Permission denied');
  });

  it('counts every version of the files recorded, and prices them', async function () {
    const before = await usage(adminId);
    assert.include(before, { useS3: false, source: 'database' });
    await raw(UserImages).insertOne({
      _id: imageId, name: 'portrait.png',
      versions: { original: { size: 1000, meta: {} }, thumbnail: { size: 200, meta: {} } },
    });
    await raw(ArchiveCreatureFiles).insertOne({
      _id: archiveId, name: 'hero.json', versions: { original: { size: 500, meta: {} } },
    });
    const after = await usage(adminId);
    assert.equal(after.bytes - before.bytes, 1700);
    assert.equal(after.objectCount - before.objectCount, 3);
    assert.deepEqual(after.prefixes.map(prefix => prefix.prefix), ['files/']);
    assert.equal(after.monthlyCost, estimateMonthlyStorageCost(after.bytes, undefined));
  });
});
