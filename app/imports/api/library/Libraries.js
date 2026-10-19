import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import SimpleSchema from 'meteor/aldeed:simple-schema';
import SharingSchema from '/imports/api/sharing/SharingSchema';
import simpleSchemaMixin from '/imports/api/creature/mixins/simpleSchemaMixin';
import { assertEditPermission, assertOwnership } from '/imports/api/sharing/sharingPermissions';
import { assertCanCreateLibrary } from '/imports/api/users/assertRolePermissions';
import { getCollectionByName } from '/imports/api/parenting/docReferences';
import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';
import { LIBRARY_LANGUAGES } from '/imports/api/library/libraryLanguage';
import { LIBRARY_LICENSES } from '/imports/api/library/libraryLicense';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';

/**
 * Libraries are trees of library nodes where each node represents a character
 * property.
 *
 * Libraries can be shared, have multiple readers and writers, and can be
 * subscribed to.
 *
 * Permissions to library nodes are controlled by the libraries they belong to.
 */
let Libraries = new Mongo.Collection('libraries');

let LibrarySchema = new SimpleSchema({
  name: {
    type: String,
    max: STORAGE_LIMITS.name,
  },
  description: {
    type: String,
    optional: true,
    max: STORAGE_LIMITS.summary,
  },
  showInMarket: {
    index: 1,
    type: Boolean,
    optional: true,
  },
  subscriberCount: {
    index: 1,
    type: Number,
    optional: true,
  },
  // The language it is written in (UX13), set by its owner; without it, a
  // guess from the name and description (libraryLanguage.js)
  language: {
    type: String,
    allowedValues: LIBRARY_LANGUAGES,
    optional: true,
  },
  // Recommended by the instance's admins: a badge, listed first
  recommended: {
    type: Boolean,
    optional: true,
  },
  // The licence its content is under, set by its owner (libraryLicense.js)
  license: {
    type: String,
    allowedValues: LIBRARY_LICENSES,
    optional: true,
  },
  // Which other open licence, and the notice it asks for
  licenseNote: {
    type: String,
    optional: true,
    max: STORAGE_LIMITS.summary,
  },
});

LibrarySchema.extend(SharingSchema);

Libraries.attachSchema(LibrarySchema);

export default Libraries;

/**
 * A new library of the user's: its name and description. Everything else is
 * set by its own method, which checks who may set it: its sharing and licence
 * by the owner, its language and `showInMarket` by an editor once it exists,
 * `recommended` by an admin, `subscriberCount` by the subscriptions. The client
 * could send them all here, and a library listed itself first in the browser
 * with as many subscribers as it liked: any other field is ignored
 */
const insertLibrary = new ValidatedMethod({
  name: 'libraries.insert',
  mixins: [
    simpleSchemaMixin,
    RateLimiterMixin,
  ],
  schema: LibrarySchema.pick('name', 'description'),
  schemaValidatorOptions: { clean: true, filter: true },
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ name, description }) {
    if (!this.userId) {
      throw new Meteor.Error('Libraries.methods.insert.denied',
        'You need to be logged in to insert a library');
    }
    if (Meteor.isServer) {
      await assertCanCreateLibrary(this.userId);
    }
    return await Libraries.insertAsync({ name, description, owner: this.userId });
  },
});

const updateLibraryName = new ValidatedMethod({
  name: 'libraries.updateName',
  validate: new SimpleSchema({
    _id: {
      type: String,
      regEx: SimpleSchema.RegEx.id
    },
    name: {
      type: String,
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ _id, name }) {
    let library = await Libraries.findOneAsync(_id);
    await assertEditPermission(library, this.userId);
    await Libraries.updateAsync(_id, { $set: { name } });
  },
});

const updateLibraryDescription = new ValidatedMethod({
  name: 'libraries.updateDescription',
  validate: new SimpleSchema({
    _id: {
      type: String,
      regEx: SimpleSchema.RegEx.id
    },
    description: {
      type: String,
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ _id, description }) {
    let library = await Libraries.findOneAsync(_id);
    await assertEditPermission(library, this.userId);
    await Libraries.updateAsync(_id, { $set: { description } });
  },
});

const updateLibraryShowInMarket = new ValidatedMethod({
  name: 'libraries.updateShowInMarket',
  validate: new SimpleSchema({
    _id: {
      type: String,
      regEx: SimpleSchema.RegEx.id
    },
    value: {
      type: Boolean,
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ _id, value }) {
    let library = await Libraries.findOneAsync(_id);
    await assertEditPermission(library, this.userId);
    await Libraries.updateAsync(_id, { $set: { showInMarket: value } });
  },
});

const removeLibrary = new ValidatedMethod({
  name: 'libraries.remove',
  validate: new SimpleSchema({
    _id: {
      type: String,
      regEx: SimpleSchema.RegEx.id
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ _id }) {
    let library = await Libraries.findOneAsync(_id);
    assertOwnership(library, this.userId);
    this.unblock();
    await removeLibaryWork(_id)
  }
});

export async function removeLibaryWork(libraryId) {
  await Libraries.removeAsync(libraryId);
  // By name: LibraryNodes.ts imports this module (an import cycle otherwise)
  await getCollectionByName('libraryNodes').removeAsync(getFilter.descendantsOfRoot(libraryId));
}

export { LibrarySchema, insertLibrary, updateLibraryName, updateLibraryDescription, updateLibraryShowInMarket, removeLibrary };
