import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import libraryLanguage, { matchesLanguage } from '/imports/api/library/libraryLanguage';
import Libraries from '/imports/api/library/Libraries';
import LibraryCollections from '/imports/api/library/LibraryCollections';
import { setLibraryLanguage, setLibraryRecommended } from '/imports/api/library/methods/libraryLanguageMethods';

describe('Library language', function () {
  it('takes the field its owner set over the guess', function () {
    assert.equal(libraryLanguage({ language: 'fr', name: 'The Libraries of Vexus', description: 'Every class and the rules' }), 'fr');
  });

  it('guesses from the name and description when the field is empty', function () {
    assert.equal(libraryLanguage({ name: 'Bibliothèques de Vexus', description: 'Les règles et les classes' }), 'fr');
    assert.equal(libraryLanguage({ name: 'Libraries of Vexus', description: 'The rules and the classes' }), 'en');
    assert.equal(libraryLanguage({ name: 'La Forge de Reliques de Khourdaet (5e24) - v0.4' }), 'fr');
    assert.isUndefined(libraryLanguage({ name: 'Vexus' }));
    assert.equal(libraryLanguage({ language: 'de', name: 'The rules of the game' }), 'en');
  });

  it('filters by language, keeping those it cannot tell', function () {
    const french = { language: 'fr' };
    const unknown = { name: 'Vexus' };
    assert.isTrue(matchesLanguage(french, 'fr'));
    assert.isFalse(matchesLanguage(french, 'en'));
    assert.isTrue(matchesLanguage(french, 'all'));
    assert.isTrue(matchesLanguage(unknown, 'en'));
  });
});

describe('Setting a library\'s language and recommendation', function () {
  const [ownerId, playerId, adminId, libraryId, collectionId] = [Random.id(), Random.id(), Random.id(), Random.id(), Random.id()];
  const as = (method, userId, args) => method._execute({ userId }, args);
  let errorOf;

  before(async function () {
    if (!Meteor.isServer) this.skip();
    errorOf = async promise => promise.then(() => undefined, error => error);
    await Meteor.users.insertAsync({ _id: ownerId, username: `owner-${ownerId}` });
    await Meteor.users.insertAsync({ _id: playerId, username: `player-${playerId}` });
    await Meteor.users.insertAsync({ _id: adminId, username: `admin-${adminId}`, roles: ['admin'] });
    await Libraries.rawCollection().insertOne(/** @type {any} */ ({ _id: libraryId, name: 'Rules', owner: ownerId, readers: [], writers: [] }));
    await LibraryCollections.rawCollection().insertOne(/** @type {any} */ ({
      _id: collectionId, name: 'Les règles', owner: ownerId, readers: [], writers: [], libraries: [libraryId],
    }));
  });

  after(async function () {
    if (!Meteor.isServer) return;
    await Libraries.removeAsync(libraryId);
    await LibraryCollections.removeAsync(collectionId);
    await Meteor.users.removeAsync({ _id: { $in: [ownerId, playerId, adminId] } });
  });

  it('lets the owner set the language, and clear it', async function () {
    await as(setLibraryLanguage, ownerId, { collection: 'libraryCollections', _id: collectionId, language: 'fr' });
    assert.equal((await LibraryCollections.findOneAsync(collectionId))?.language, 'fr');
    await as(setLibraryLanguage, ownerId, { collection: 'libraryCollections', _id: collectionId });
    assert.notProperty(await LibraryCollections.findOneAsync(collectionId), 'language');
  });

  it('refuses the language to someone who cannot edit it', async function () {
    const error = await errorOf(as(setLibraryLanguage, playerId, { collection: 'libraries', _id: libraryId, language: 'en' }));
    assert.exists(error);
    assert.notProperty(await Libraries.findOneAsync(libraryId), 'language');
  });

  it('lets admins alone recommend it', async function () {
    const error = await errorOf(as(setLibraryRecommended, ownerId, { collection: 'libraries', _id: libraryId, recommended: true }));
    assert.exists(error);
    await as(setLibraryRecommended, adminId, { collection: 'libraries', _id: libraryId, recommended: true });
    assert.isTrue((await Libraries.findOneAsync(libraryId))?.recommended);
    await as(setLibraryRecommended, adminId, { collection: 'libraries', _id: libraryId, recommended: false });
    assert.notProperty(await Libraries.findOneAsync(libraryId), 'recommended');
  });
});
