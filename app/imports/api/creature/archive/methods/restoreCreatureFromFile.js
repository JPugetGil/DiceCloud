import SCHEMA_VERSION from '/imports/constants/SCHEMA_VERSION';
import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import Experiences from '/imports/api/creature/experience/Experiences';
import { removeCreatureWork } from '/imports/api/creature/creatures/methods/removeCreature';
import ArchiveCreatureFiles from '/imports/api/creature/archive/ArchiveCreatureFiles';
import { incrementFileStorageUsed } from '/imports/api/users/methods/updateFileStorageUsed';
import verifyArchiveSafety from '/imports/api/creature/archive/methods/verifyArchiveSafety';
import batchInsertAsync from '/imports/api/utility/batchInsertAsync';
import { assertCanCreateCharacter } from '/imports/api/users/assertRolePermissions';
import { insertCreatureCopy } from '/imports/api/creature/creatures/methods/duplicateCreature';
import { Meteor } from 'meteor/meteor';

let migrateArchive;
if (Meteor.isServer) {
  // require(), not import: this module is only pulled in on one side of the
  // wire, and a static import would bundle it into both
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  migrateArchive = require('/imports/migrations/archive/migrateArchive').default;
}

async function restoreCreature(archive, userId) {
  if (SCHEMA_VERSION < archive.meta.schemaVersion) {
    throw new Meteor.Error('Incompatible',
      'The archive file is from a newer version. Update required to read.')
  }

  // Migrate and verify the archive meets the current schema
  migrateArchive(archive);

  // Asset that the archive is safe
  verifyArchiveSafety(archive);

  // The character still exists, as when restoring a file downloaded from its
  // sheet: restore a copy beside it, with new ids
  const existingCreature = await Creatures.findOneAsync(archive.creature._id, {
    fields: { _id: 1 }
  });
  if (existingCreature) {
    return insertCreatureCopy(archive, { owner: userId });
  }

  // Ensure the user owns the restored creature
  archive.creature.owner = userId;

  // Insert the creature sub documents
  // They still have their original _id's
  await Creatures.insertAsync(archive.creature);
  try {
    // Add all the properties
    if (archive.properties && archive.properties.length) {
      await batchInsertAsync(CreatureProperties, archive.properties);
    }
    if (archive.experiences && archive.experiences.length) {
      await batchInsertAsync(Experiences, archive.experiences);
    }
    if (archive.logs && archive.logs.length) {
      await batchInsertAsync(CreatureLogs, archive.logs);
    }
  } catch (e) {
    // If the above fails, delete the inserted creature
    await removeCreatureWork(archive.creature._id);
    throw e;
  }
  return archive.creature._id;
}

const restoreCreaturefromFile = new ValidatedMethod({
  name: 'Creatures.methods.restoreCreaturefromFile',
  validate: new SimpleSchema({
    'fileId': {
      type: String,
      max: 32,
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 10,
    timeInterval: 5000,
  },
  async run({ fileId }) {
    // fetch the file
    const file = (await ArchiveCreatureFiles.findOneAsync({ _id: fileId }))?.get();
    if (!file) {
      throw new Meteor.Error('File not found',
        'The requested creature archive does not exist');
    }
    // Assert ownership
    const userId = file?.userId;
    if (!userId || userId !== this.userId) {
      throw new Meteor.Error('Permission denied',
        'You can only restore creatures you own');
    }


    let creatureId;
    if (Meteor.isServer) {
      // A restored character counts towards the user's character limit
      await assertCanCreateCharacter(this.userId);
      // Read the file data
      const archive = await ArchiveCreatureFiles.readJSONFile(file);
      creatureId = await restoreCreature(archive, this.userId);
    }
    //Remove the archive once the restore succeeded
    await ArchiveCreatureFiles.removeAsync({ _id: fileId });
    // Update the user's file storage limits
    await incrementFileStorageUsed(userId, -file.size);
    return creatureId;
  },
});

export default restoreCreaturefromFile;
