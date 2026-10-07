import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Libraries from '/imports/api/library/Libraries';
import { LIBRARY_LICENSES, isSrdLicense, licenseLabel } from '/imports/api/library/libraryLicense';
import { setLibraryLicense } from '/imports/api/library/methods/libraryLicenseMethods';

describe('Library licence', function () {
  const t = key => `<${key}>`;

  it('names the SRDs\' licence the same in every language, the others through their messages', function () {
    assert.equal(licenseLabel('srd-5.1', t), 'SRD 5.1 · CC BY 4.0');
    assert.equal(licenseLabel('srd-5.2.1', t), 'SRD 5.2.1 · CC BY 4.0');
    assert.equal(licenseLabel('original', t), '<library.licenses.original>');
    assert.isUndefined(licenseLabel(undefined, t));
    assert.isUndefined(licenseLabel('gpl', t));
    assert.isTrue(isSrdLicense('srd-5.1'));
    assert.isFalse(isSrdLicense('other-open'));
    assert.includeMembers([...LIBRARY_LICENSES], ['srd-5.1', 'original', 'other-open', 'private']);
  });
});

describe('Setting a library\'s licence', function () {
  const [ownerId, writerId, libraryId] = [Random.id(), Random.id(), Random.id()];
  // Async: a call its schema refuses throws before it runs, which then rejects
  const as = async (userId, args) => /** @type {any} */ (setLibraryLicense)._execute({ userId }, { _id: libraryId, ...args });
  const library = () => Libraries.findOneAsync(libraryId);
  const errorOf = promise => promise.then(() => undefined, error => error);

  before(async function () {
    if (!Meteor.isServer) this.skip();
    await Meteor.users.rawCollection().insertMany([
      { _id: ownerId, createdAt: new Date(), username: `license-owner-${ownerId}` },
      { _id: writerId, createdAt: new Date(), username: `license-writer-${writerId}` },
    ]);
    await Libraries.rawCollection().insertOne(/** @type {any} */ ({
      _id: libraryId, name: 'Homebrew', owner: ownerId, readers: [], writers: [writerId], public: true,
    }));
  });

  after(async function () {
    if (!Meteor.isServer) return;
    await Libraries.removeAsync(libraryId);
    await Meteor.users.removeAsync({ _id: { $in: [ownerId, writerId] } });
  });

  it('lets its owner state it, and the note of another open licence', async function () {
    await as(ownerId, { license: 'srd-5.1' });
    assert.include(await library(), { license: 'srd-5.1' });
    await as(ownerId, { license: 'other-open', licenseNote: '  ORC licence: notice  ' });
    assert.include(await library(), { license: 'other-open', licenseNote: 'ORC licence: notice' });
    // The note goes with an empty one, the licence without one
    await as(ownerId, { license: 'original' });
    assert.notProperty(await library(), 'licenseNote');
    await as(ownerId, {});
    assert.notProperty(await library(), 'license');
  });

  it('is its owner\'s statement alone, among the licences it knows', async function () {
    const refused = await errorOf(as(writerId, { license: 'private' }));
    assert.exists(refused, 'a writer of the library');
    assert.exists(await errorOf(as(null, { license: 'private' })), 'nobody signed in');
    assert.equal((await errorOf(as(ownerId, { license: 'gpl' })))?.error, 'validation-error');
    assert.notProperty(await library(), 'license');
  });
});
