import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import ArchiveCreatureFiles from '/imports/api/creature/archive/ArchiveCreatureFiles';
import UserImages from '/imports/api/files/userImages/UserImages';
import { getFileStorageError } from '/imports/api/users/roles';
import { Meteor } from 'meteor/meteor';
const fileCollections = [ArchiveCreatureFiles, UserImages];

const updateFileStorageUsed = new ValidatedMethod({
  name: 'users.recalculateFileStorageUsed',
  validate: null,
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run() {
    const userId = Meteor.userId();
    if (!userId) throw new Meteor.Error('No user',
      'You must be logged in to recalculate your file use');
    const user = await Meteor.users.findOneAsync(userId);
    if (!user) {
      throw new Meteor.Error('noUser', 'User not found');
    }
    await updateFileStorageUsedWork(userId);
  }
});

export default updateFileStorageUsed;

export async function updateFileStorageUsedWork(userId) {
  if (!userId) {
    throw new Meteor.Error('idRequired',
      'No user ID was provided to update file storage used')
  }

  let sum = 0;
  // for...of rather than forEach: an async callback handed to forEach is never
  // awaited, so `sum` was still 0 when it was written to the user below.
  for (const collection of fileCollections) {
    await collection.find({ userId }, { fields: { size: 1 } }).forEachAsync(file => {
      sum += file.size;
    });
  }

  await Meteor.users.updateAsync(userId, {
    $set: {
      fileStorageUsed: sum,
    }
  });
}

/**
 * Why the user can't store another `fileSize` bytes within their role's file
 * storage limit, undefined if they can. On the client this reads the logged in
 * user from minimongo, so only pass it that user's id there.
 */
export async function getUserFileStorageError(userId, fileSize) {
  if (!userId) return 'You need to be logged in to upload files';
  const fields = { roles: 1, fileStorageUsed: 1 };
  let user = await Meteor.users.findOneAsync(userId, { fields });
  if (!user) return 'User not found';
  if (Meteor.isServer && user.fileStorageUsed === undefined) {
    // The user doesn't have a current value for storage used, calculate it
    // from scratch
    await updateFileStorageUsedWork(userId);
    user = await Meteor.users.findOneAsync(userId, { fields });
  }
  return getFileStorageError(user, fileSize);
}

export async function incrementFileStorageUsed(userId, amount) {
  if (!userId) {
    throw new Meteor.Error('idRequired',
      'No user ID was provided to update file storage used')
  }

  const user = await Meteor.users.findOneAsync(userId);
  if (!user) {
    throw new Meteor.Error('noUser', 'User not found');
  }

  if (user.fileStorageUsed === undefined) {
    // The user doesn't have a current value for storage used, calculate it
    // from scratch
    await updateFileStorageUsedWork(userId);
  } else {
    await Meteor.users.updateAsync(userId, {
      $inc: {
        fileStorageUsed: amount,
      }
    });
  }
}
