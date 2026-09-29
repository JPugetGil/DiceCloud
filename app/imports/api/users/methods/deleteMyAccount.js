import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import Libraries, { removeLibaryWork } from '/imports/api/library/Libraries';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { removeCreatureWork } from '/imports/api/creature/creatures/methods/removeCreature';
import { Meteor } from 'meteor/meteor';

Meteor.users.deleteMyAccount = new ValidatedMethod({
  name: 'users.deleteMyAccount',
  validate: null,
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 1,
    timeInterval: 5000,
  },
  async run() {
    let userId = Meteor.userId();
    if (!userId) throw new Meteor.Error('No user',
      'You must be logged in to delete your account');

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
    }, {
      $pull: {
        writers: userId,
        readers: userId
      },
    }, {
      multi: true,
    });

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
    }, {
      $pull: {
        writers: userId,
        readers: userId
      },
    }, {
      multi: true,
    });

    // Delete the user's library collections, character folders, uploaded
    // images and character archives (from S3 too). Server only: the client's
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
      await LibraryCollections.removeAsync({ owner: userId });
      await CreatureFolders.removeAsync({ owner: userId });
      await UserImages.removeAsync({ userId });
      await ArchiveCreatureFiles.removeAsync({ userId });
    }

    // delete the account
    await Meteor.users.removeAsync(userId);
  }
});
