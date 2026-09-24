import SimpleSchema from 'meteor/aldeed:simple-schema';
import '/imports/api/users/Users';

Meteor.publish('user', function () {
  return Meteor.users.find(this.userId, {
    fields: {
      roles: 1,
      username: 1,
      apiKey: 1,
      darkMode: 1,
      subscribedLibraries: 1,
      subscribedLibraryCollections: 1,
      fileStorageUsed: 1,
      profile: 1,
      preferences: 1,
      'services.google.id': 1,
      'services.google.picture': 1,
      'services.google.name': 1,
      'services.google.email': 1,
      'services.google.locale': 1,
    }
  });
});

let userIdsSchema = new SimpleSchema({
  ids: {
    type: Array,
    optional: true,
  },
  'ids.$': {
    type: String,
    max: 32,
  }
})

Meteor.publish('userPublicProfiles', function (ids) {
  userIdsSchema.validate({ ids });
  if (!this.userId || !ids) return this.ready();
  return Meteor.users.find({
    _id: { $in: ids }
  }, {
    fields: { username: 1 },
    sort: { username: 1 },
  });
});
