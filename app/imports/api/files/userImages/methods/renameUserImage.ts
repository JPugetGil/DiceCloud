import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import UserImages from '/imports/api/files/userImages/UserImages';
import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';
import { Meteor } from 'meteor/meteor';

// Takes the name without its extension, which is kept: downloads are named
// after the file, and need it
const renameUserImage = new ValidatedMethod({
  name: 'userImages.methods.rename',
  validate: new SimpleSchema({
    fileId: {
      type: String,
      max: 32,
    },
    name: {
      type: String,
      trim: true,
      min: 1,
      max: STORAGE_LIMITS.name,
    },
  }).validator({ clean: true }),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ fileId, name }: { fileId: string, name: string }) {
    if (!this.userId) {
      throw new Meteor.Error('logged-out',
        'The user must be logged in to rename a file');
    }
    const file = await UserImages.collection.findOneAsync(fileId);
    if (!file) {
      throw new Meteor.Error('File not found', 'The requested image does not exist');
    }
    if (file.userId !== this.userId) {
      throw new Meteor.Error('Permission denied', 'You can only rename your own images');
    }
    const fileName = file.extension ? `${name}.${file.extension}` : name;
    await UserImages.collection.updateAsync(fileId, { $set: { name: fileName } });
  },
});

export default renameUserImage;
