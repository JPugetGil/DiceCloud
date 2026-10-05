import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import Libraries from '/imports/api/library/Libraries';
import LibraryCollections from '/imports/api/library/LibraryCollections';
import '/imports/api/users/methods/deleteMyAccount';
import '/imports/api/users/methods/addEmail';
import '/imports/api/users/methods/removeEmail';
import '/imports/api/users/methods/searchUsers';
import '/imports/api/users/methods/setUserRole';
import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';
import { DISTANCE_UNITS, WEIGHT_UNITS } from '/imports/api/utility/units';
// What a new account is subscribed to: comma-separated ids (deploy/.env.example)
const idList = value => (value || '').split(',').map(id => id.trim()).filter(Boolean);
const defaultLibraries = idList(process.env.DEFAULT_LIBRARIES);
const defaultLibraryCollections = idList(process.env.DEFAULT_LIBRARY_COLLECTIONS);

const userSchema = new SimpleSchema({
  username: {
    type: String,
    optional: true,
    max: 30,
    min: 4,
  },
  emails: {
    type: Array,
    optional: true,
  },
  'emails.$': {
    type: Object,
  },
  'emails.$.address': {
    type: String,
    regEx: SimpleSchema.RegEx.Email,
  },
  'emails.$.verified': {
    type: Boolean,
  },
  registered_emails: {
    type: Array,
    optional: true,
  },
  'registered_emails.$': {
    type: Object,
    blackbox: true,
  },
  createdAt: {
    type: Date
  },
  services: {
    type: Object,
    optional: true,
    blackbox: true,
  },
  // The user's role (see /imports/api/users/roles), and other roles like
  // docsWriter
  roles: {
    type: Array,
    optional: true,
  },
  'roles.$': {
    type: String
  },
  // In order to avoid an 'Exception in setInterval callback' from Meteor
  heartbeat: {
    type: Date,
    optional: true,
  },
  darkMode: {
    type: Boolean,
    optional: true,
  },
  subscribedLibraries: {
    type: Array,
    defaultValue: defaultLibraries,
    maxCount: 100,
  },
  'subscribedLibraries.$': {
    type: String,
    max: 32,
  },
  subscribedLibraryCollections: {
    type: Array,
    defaultValue: defaultLibraryCollections,
    maxCount: 100,
  },
  'subscribedLibraryCollections.$': {
    type: String,
    max: 32,
  },
  fileStorageUsed: {
    type: Number,
    optional: true,
  },
  profile: {
    type: Object,
    blackbox: true,
    optional: true,
  },
  preferences: {
    type: Object,
    optional: true,
    defaultValue: {},
  },
  'preferences.swapAbilityScoresAndModifiers': {
    type: Boolean,
    optional: true,
  },
  'preferences.hidePropertySelectDialogHelp': {
    type: Boolean,
    optional: true,
  },
  // Animations reduced whatever the system asks: no movement, short fades
  // (useReducedMotion). Unset: as the system asks. Replaces
  // `disableDiceAnimation`, moved over at startup (below)
  'preferences.reduceMotion': {
    type: Boolean,
    optional: true,
  },
  // Interface language, see imports/ui/i18n
  'preferences.language': {
    type: String,
    allowedValues: ['en', 'fr'],
    optional: true,
  },
  // Units distances and weights are shown in; stored values stay metric
  // (see imports/api/utility/units)
  'preferences.distanceUnit': {
    type: String,
    allowedValues: DISTANCE_UNITS,
    optional: true,
  },
  'preferences.weightUnit': {
    type: String,
    allowedValues: WEIGHT_UNITS,
    optional: true,
  },
});

Meteor.users.attachSchema(userSchema);

Meteor.users.setDarkMode = new ValidatedMethod({
  name: 'users.setDarkMode',
  validate: new SimpleSchema({
    darkMode: { type: Boolean, optional: true },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 2000,
  },
  async run({ darkMode }) {
    if (!this.userId) return;
    await Meteor.users.updateAsync(this.userId, { $set: { darkMode } });
  },
});

Meteor.users.setLanguage = new ValidatedMethod({
  name: 'users.setLanguage',
  validate: new SimpleSchema({
    language: { type: String, allowedValues: ['en', 'fr'] },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 2000,
  },
  async run({ language }) {
    if (!this.userId) return;
    await Meteor.users.updateAsync(this.userId, { $set: { 'preferences.language': language } });
  },
});

Meteor.users.setUnitPreference = new ValidatedMethod({
  name: 'users.setUnitPreference',
  validate: new SimpleSchema({
    quantity: { type: String, allowedValues: ['distance', 'weight'] },
    unit: { type: String, allowedValues: [...DISTANCE_UNITS, ...WEIGHT_UNITS] },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 2000,
  },
  async run({ quantity, unit }) {
    const allowed = quantity === 'distance' ? DISTANCE_UNITS : WEIGHT_UNITS;
    if (!allowed.includes(unit)) {
      throw new Meteor.Error('invalid-unit', `${unit} is not a ${quantity} unit`);
    }
    if (!this.userId) return;
    await Meteor.users.updateAsync(this.userId, {
      $set: { [`preferences.${quantity}Unit`]: unit },
    });
  },
});

Meteor.users.canPickUsername = new ValidatedMethod({
  name: 'users.canPickUsername',
  validate: userSchema.pick('username').validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ username }) {
    if (Meteor.isClient) return;
    const user = await Accounts.findUserByUsername(username);
    // You can pick your own username
    if (user && user._id === this.userId) {
      return false;
    }
    return !!user;
  }
});

Meteor.users.setUsername = new ValidatedMethod({
  name: 'users.setUsername',
  validate: userSchema.pick('username').validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ username }) {
    if (!this.userId) throw 'Can only set your username if logged in';
    if (Meteor.isClient) return;
    return await Accounts.setUsername(this.userId, username);
  }
});

Meteor.users.setPreference = new ValidatedMethod({
  name: 'users.setPreference',
  validate: new SimpleSchema({
    preference: {
      type: String,
    },
    value: {
      type: SimpleSchema.oneOf(Boolean),
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ preference, value }) {
    if (!this.userId) throw 'You can only set preferences once logged in';
    let prefPath = `preferences.${preference}`
    if (value == true) {
      return await Meteor.users.updateAsync(this.userId, {
        $set: { [prefPath]: true },
      });
    } else {
      return await Meteor.users.updateAsync(this.userId, {
        $unset: { [prefPath]: 1 },
      });
    }
  },
});

if (Meteor.isServer) {
  // `disableDiceAnimation` became the Animations preference: accounts that
  // turned the dice off get reduced animations. Idempotent, there is no
  // migration framework (the old field is no longer in the schema)
  Meteor.startup(async () => {
    const options = { multi: true, bypassCollection2: true };
    await Meteor.users.updateAsync({ 'preferences.disableDiceAnimation': true }, {
      $set: { 'preferences.reduceMotion': true },
    }, options);
    await Meteor.users.updateAsync({ 'preferences.disableDiceAnimation': { $exists: true } }, {
      $unset: { 'preferences.disableDiceAnimation': 1 },
    }, options);
  });

  Accounts.onCreateUser(async (options, user) => {
    if (defaultLibraries?.length) {
      await Libraries.updateAsync({
        _id: { $in: defaultLibraries }
      }, {
        $inc: { subscriberCount: 1 }
      }, {
        multi: true,
      }, () => {/**/ });
    }
    if (defaultLibraryCollections?.length) {
      await LibraryCollections.updateAsync({
        _id: { $in: defaultLibraryCollections }
      }, {
        $inc: { subscriberCount: 1 }
      }, {
        multi: true,
      }, () => {/**/ });
    }
    return user;
  });
}

Meteor.users.subscribeToLibrary = new ValidatedMethod({
  name: 'users.subscribeToLibrary',
  validate: new SimpleSchema({
    libraryId: {
      type: String,
      max: 32,
    },
    subscribe: {
      type: Boolean,
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 2000,
  },
  async run({ libraryId, subscribe }) {
    if (!this.userId) throw 'Can only subscribe if logged in';
    if (subscribe) {
      await Libraries.updateAsync({ _id: libraryId }, { $inc: { subscriberCount: 1 } }, () => {/**/ });
      return await Meteor.users.updateAsync(this.userId, {
        $addToSet: { subscribedLibraries: libraryId },
      });
    } else {
      await Libraries.updateAsync({ _id: libraryId }, { $inc: { subscriberCount: -1 } }, () => {/**/ });
      return await Meteor.users.updateAsync(this.userId, {
        $pullAll: { subscribedLibraries: libraryId },
      });
    }
  }
});

Meteor.users.subscribeToLibraryCollection = new ValidatedMethod({
  name: 'users.subscribeToLibraryCollection',
  validate: new SimpleSchema({
    libraryCollectionId: {
      type: String,
      max: 32,
    },
    subscribe: {
      type: Boolean,
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ libraryCollectionId, subscribe }) {
    if (!this.userId) throw 'Can only subscribe if logged in';
    if (subscribe) {
      await LibraryCollections.updateAsync({ _id: libraryCollectionId }, { $inc: { subscriberCount: 1 } }, () => {/**/ });
      return await Meteor.users.updateAsync(this.userId, {
        $addToSet: { subscribedLibraryCollections: libraryCollectionId },
      });
    } else {
      await LibraryCollections.updateAsync({ _id: libraryCollectionId }, { $inc: { subscriberCount: -1 } }, () => {/**/ });
      return await Meteor.users.updateAsync(this.userId, {
        $pullAll: { subscribedLibraryCollections: libraryCollectionId },
      });
    }
  }
});

Meteor.users.findUserByUsernameOrEmail = new ValidatedMethod({
  name: 'users.findUserByUsernameOrEmail',
  validate: new SimpleSchema({
    usernameOrEmail: {
      type: String,
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ usernameOrEmail }) {
    if (Meteor.isClient) return;
    const user = await Accounts.findUserByUsername(usernameOrEmail) ||
      await Accounts.findUserByEmail(usernameOrEmail);
    return user && user._id;
  }
});
