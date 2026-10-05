import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import Libraries from '/imports/api/library/Libraries';
import LibraryCollections from '/imports/api/library/LibraryCollections';
import { LIBRARY_LANGUAGES } from '/imports/api/library/libraryLanguage';
import { assertEditPermission } from '/imports/api/sharing/sharingPermissions';
import { assertCanManageRoles } from '/imports/api/users/assertRolePermissions';

/*
 * A library's or a collection's language and recommendation (UX13): its
 * owner, and those who edit it, set the language; the admins, who curate
 * what the community library browser puts first, recommend it.
 */
// Looked up when called: Libraries imports this file, through LibraryNodes,
// before it is defined
const collectionOf = name => name === 'libraries' ? Libraries : LibraryCollections;

const docSchema = {
  collection: { type: String, allowedValues: ['libraries', 'libraryCollections'] },
  _id: { type: String, max: 32 },
};

async function getDoc(collection, _id) {
  const doc = await collectionOf(collection).findOneAsync(_id, { fields: { owner: 1, writers: 1 } });
  if (!doc) throw new Meteor.Error('not-found', 'Library or library collection not found');
  return doc;
}

/** Sets the language, or clears it (the guess applies again) */
export const setLibraryLanguage = new ValidatedMethod({
  name: 'libraries.setLanguage',
  validate: new SimpleSchema({
    ...docSchema,
    language: { type: String, allowedValues: LIBRARY_LANGUAGES, optional: true },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: { numRequests: 5, timeInterval: 5000 },
  async run({ collection, _id, language }) {
    const doc = await getDoc(collection, _id);
    await assertEditPermission(doc, this.userId);
    await collectionOf(collection).updateAsync(_id, language
      ? { $set: { language } }
      : { $unset: { language: 1 } });
  },
});

/** Recommends it, or no longer: admins only */
export const setLibraryRecommended = new ValidatedMethod({
  name: 'libraries.setRecommended',
  validate: new SimpleSchema({
    ...docSchema,
    recommended: { type: Boolean },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: { numRequests: 5, timeInterval: 5000 },
  async run({ collection, _id, recommended }) {
    if (Meteor.isServer) await assertCanManageRoles(this.userId);
    await getDoc(collection, _id);
    await collectionOf(collection).updateAsync(_id, recommended
      ? { $set: { recommended: true } }
      : { $unset: { recommended: 1 } });
  },
});
