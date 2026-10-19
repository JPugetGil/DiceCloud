import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import Libraries, { removeLibaryWork } from '/imports/api/library/Libraries';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { removeCreatureWork } from '/imports/api/creature/creatures/methods/removeCreature';
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';

export const deleteMyAccount = new ValidatedMethod({
  name: 'users.deleteMyAccount',
  validate: null,
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 1,
    timeInterval: 5000,
  },
  async run() {
    const userId = this.userId;
    if (!userId) throw new Meteor.Error('No user',
      'You must be logged in to delete your account');

    // Their own folders first: the fights on their boards end with them, and
    // no creature's turn starts there as theirs leave the tracker
    // (removeFromTracker). Server only, imported when called, as below
    if (Meteor.isServer) {
      const { default: CreatureFolders } = await import('/imports/api/creature/creatureFolders/CreatureFolders');
      await CreatureFolders.removeAsync({ owner: userId });
    }

    // Delete all creatures
    let creatures = await Creatures.find({ owner: userId }, { fields: { _id: 1 } }).fetchAsync();
    // for...of rather than forEach: an async callback handed to forEach is never
    // awaited, so the removals raced with the updates below.
    for (const creature of creatures) {
      await removeCreatureWork(creature._id);
    }

    // Remove permissions from all creatures
    await Creatures.updateAsync({
      $or: [
        { writers: userId },
        { readers: userId },
      ],
    }, /** @type {any} */ ({
      $pull: {
        writers: userId,
        readers: userId
      },
    }), {
      multi: true,
    });

    // The characters chosen on Discord with /character (D6), and /action's
    // menus in progress and last targets
    if (Meteor.isServer) {
      const { forgetActiveCharacters } = await import('/imports/api/discord/server/interactions/interactionCharacters');
      await forgetActiveCharacters(userId);
      const { forgetActionSessions } = await import('/imports/api/discord/server/interactions/actionSessions');
      await forgetActionSessions(userId);
    }

    // Delete all libraries
    let libraries = await Libraries.find({ owner: userId }, { fields: { _id: 1 } }).fetchAsync();
    for (const library of libraries) {
      await removeLibaryWork(library._id);
    }

    // Remove permissions from all creatures
    await Libraries.updateAsync({
      $or: [
        { writers: userId },
        { readers: userId },
      ],
    }, /** @type {any} */ ({
      $pull: {
        writers: userId,
        readers: userId
      },
    }), {
      multi: true,
    });

    // Delete the user's library collections, uploaded images and character
    // archives (from S3 too), and take the user out of
    // the collections shared with them and of the parties they joined (their
    // characters already left every board, with removeCreatureWork). Server
    // only: the client's
    // simulation cannot remove files. Imported here, not at the top: Users.js
    // loads this module, and UserImages loading that early is an import cycle
    // (UserImages -> updateFileStorageUsed -> UserImages) that crashes startup.
    if (Meteor.isServer) {
      const [
        { default: LibraryCollections },
        { default: CreatureFolders },
        { default: UserImages },
        { default: ArchiveCreatureFiles },
      ] = await Promise.all([
        import('/imports/api/library/LibraryCollections'),
        import('/imports/api/creature/creatureFolders/CreatureFolders'),
        import('/imports/api/files/userImages/UserImages'),
        import('/imports/api/creature/archive/ArchiveCreatureFiles'),
      ]);
      // any: Meteor's modifier types refuse a typed value in $pull on an untyped collection
      const pulled = /** @type {any} */ (userId);
      await LibraryCollections.removeAsync({ owner: userId });
      await LibraryCollections.updateAsync(
        { $or: [{ writers: userId }, { readers: userId }] },
        { $pull: { writers: pulled, readers: pulled } },
        { multi: true },
      );
      await CreatureFolders.updateAsync(
        { members: userId },
        { $pull: { members: pulled } },
        { multi: true },
      );
      await UserImages.removeAsync({ userId });
      await ArchiveCreatureFiles.removeAsync({ userId });
    }

    // Signed out first, as Meteor's own logout method does (accounts-base):
    // removing the user removes the login token this connection is signed in
    // with, which Accounts watches. It closed the connection before the result
    // was sent, and the client, reconnected and signed out, sent the call
    // again, refused with "No user"
    if (Meteor.isServer && this.connection) {
      Accounts._setLoginToken(userId, this.connection, null);
      await this.setUserId(null);
    }

    // delete the account
    await Meteor.users.removeAsync(userId);
  }
});
