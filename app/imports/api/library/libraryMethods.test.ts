import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Libraries from '/imports/api/library/Libraries';
import LibraryCollections from '/imports/api/library/LibraryCollections';
import { openAs, refusal } from '/imports/api/utility/ddpClient.testFn';

if (Meteor.isServer) {
  // The subscription methods, without Users.js, which would attach the users'
  // schema to every suite's test users
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('/imports/api/users/methods/librarySubscriptions');
}

/*
 * What ranks a library in the browser, its subscriber count and whether it
 * shows there, is the server's: a client could set them when it created one,
 * and raise the count of any library by subscribing again and again. The two
 * inserts had no rate limit, and the collections' update a limit without its
 * mixin, which did nothing.
 */
if (Meteor.isServer) describe('Libraries: the server\'s fields and rate limits', function () {
  this.timeout(60000);

  const [adminId, playerId, strangerId] = [Random.id(), Random.id(), Random.id()];
  const userIds = [adminId, playerId, strangerId];
  const forged = {
    subscriberCount: 999999,
    showInMarket: true,
    public: true,
    readers: [strangerId],
    writers: [strangerId],
    license: 'srd-5.1',
  };

  before(async function () {
    await Meteor.users.rawCollection().insertMany([
      // Admins alone create libraries
      { _id: adminId, createdAt: new Date(), username: `library-admin-${adminId}`, roles: ['admin'] },
      { _id: playerId, createdAt: new Date(), username: `library-player-${playerId}` },
      { _id: strangerId, createdAt: new Date(), username: `library-stranger-${strangerId}` },
    ] as any[]);
  });

  after(async function () {
    await (Libraries as any).removeAsync({ owner: { $in: userIds } });
    await (LibraryCollections as any).removeAsync({ owner: { $in: userIds } });
    await Meteor.users.removeAsync({ _id: { $in: userIds } });
  });

  it('creates a library with its name and description, ignoring every other field the client sends', async function () {
    const admin = await openAs(adminId);
    try {
      const libraryId = await admin.call('libraries.insert', { name: 'Homebrew', description: 'Mine', ...forged });
      const library = await Libraries.findOneAsync(libraryId) as any;
      assert.equal(library.name, 'Homebrew');
      assert.equal(library.description, 'Mine');
      assert.equal(library.owner, adminId);
      assert.notProperty(library, 'subscriberCount');
      assert.notProperty(library, 'showInMarket');
      assert.notProperty(library, 'license');
      assert.isFalse(library.public);
      assert.deepEqual(library.readers, []);
      assert.deepEqual(library.writers, []);

      const collectionId = await admin.call('libraryCollections.insert', {
        name: 'My collection', libraries: [libraryId], ...forged,
      });
      const collection = await LibraryCollections.findOneAsync(collectionId) as any;
      assert.equal(collection.owner, adminId);
      assert.deepEqual(collection.libraries, [libraryId]);
      assert.notProperty(collection, 'subscriberCount');
      assert.notProperty(collection, 'showInMarket');
      assert.isFalse(collection.public);
      assert.deepEqual(collection.readers, []);
    } finally {
      admin.close();
    }
  });

  it('limits the rate of the inserts and of the collections\' update', async function () {
    // Five calls in five seconds. The limiter counts in a fixed window, which
    // a burst may straddle: eleven quick calls exceed it in any case
    const refusals = async (name: string, args: () => object) => {
      const client = await openAs(adminId);
      try {
        const errors: unknown[] = [];
        for (let i = 0; i < 11; i += 1) errors.push((await refusal(client.call(name, args())))?.error);
        return errors.filter(error => error !== undefined);
      } finally {
        client.close();
      }
    };
    assert.include(await refusals('libraries.insert', () => ({ name: 'Spam' })), 'too-many-requests');
    assert.include(await refusals('libraryCollections.insert', () => ({ name: 'Spam' })), 'too-many-requests');
    const collectionId = await LibraryCollections.insertAsync({ name: 'Mine', owner: adminId, libraries: [] } as any);
    assert.include(await refusals('libraryCollections.update', () => ({
      _id: collectionId, update: { name: `Renamed ${Random.id()}` },
    })), 'too-many-requests');
  });

  it('counts each subscriber once, however many times they subscribe or leave', async function () {
    const libraryId = await Libraries.insertAsync({ name: 'Public', owner: adminId, public: true } as any);
    const collectionId = await LibraryCollections.insertAsync({
      name: 'Public collection', owner: adminId, public: true, libraries: [libraryId],
    } as any);
    const count = async () => [
      (await Libraries.findOneAsync(libraryId) as any).subscriberCount || 0,
      (await LibraryCollections.findOneAsync(collectionId) as any).subscriberCount || 0,
    ];
    const player = await openAs(playerId);
    // One call at a time: the methods allow 5 in 2 and 5 seconds
    const pause = () => new Promise(resolve => setTimeout(resolve, 1100));
    try {
      for (const subscribe of [true, true, true]) {
        await player.call('users.subscribeToLibrary', { libraryId, subscribe });
        await player.call('users.subscribeToLibraryCollection', { libraryCollectionId: collectionId, subscribe });
        await pause();
      }
      assert.deepEqual(await count(), [1, 1], 'subscribed three times: one subscriber');
      const user = await Meteor.users.findOneAsync(playerId) as any;
      assert.deepEqual(user.subscribedLibraries, [libraryId]);
      assert.deepEqual(user.subscribedLibraryCollections, [collectionId]);
      for (const subscribe of [false, false]) {
        await player.call('users.subscribeToLibrary', { libraryId, subscribe });
        await player.call('users.subscribeToLibraryCollection', { libraryCollectionId: collectionId, subscribe });
        await pause();
      }
      assert.deepEqual(await count(), [0, 0], 'left twice: none, never fewer');
    } finally {
      player.close();
    }
  });
});
