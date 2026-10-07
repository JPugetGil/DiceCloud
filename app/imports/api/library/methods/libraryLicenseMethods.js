import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import Libraries from '/imports/api/library/Libraries';
import { LIBRARY_LICENSES } from '/imports/api/library/libraryLicense';
import { assertOwnership } from '/imports/api/sharing/sharingPermissions';
import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';

/**
 * Sets the licence a library's content is under, and the note that names
 * another open licence and the notice it asks for; without them, clears them.
 * Its owner's alone: it is their statement of the rights they hold
 */
export const setLibraryLicense = new ValidatedMethod({
  name: 'libraries.setLicense',
  validate: new SimpleSchema({
    _id: { type: String, max: 32 },
    license: { type: String, allowedValues: LIBRARY_LICENSES, optional: true },
    licenseNote: { type: String, optional: true, max: STORAGE_LIMITS.summary },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: { numRequests: 5, timeInterval: 5000 },
  async run({ _id, license, licenseNote }) {
    // Read when called: Libraries imports this file's folder before it is defined
    const library = await Libraries.findOneAsync(_id, { fields: { owner: 1 } });
    if (!library) throw new Meteor.Error('not-found', 'Library not found');
    // Its owner's alone: `assertOwnership` refuses no user id too
    assertOwnership(library, /** @type {string} */ (this.userId));
    const note = licenseNote?.trim();
    await Libraries.updateAsync(_id, {
      ...(license || note) && { $set: { ...license && { license }, ...note && { licenseNote: note } } },
      ...(!license || !note) && { $unset: { ...!license && { license: 1 }, ...!note && { licenseNote: 1 } } },
    });
  },
});
