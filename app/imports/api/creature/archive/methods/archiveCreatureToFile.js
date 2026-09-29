import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import SCHEMA_VERSION from '/imports/constants/SCHEMA_VERSION';
import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { assertOwnership } from '/imports/api/creature/creatures/creaturePermissions';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import Experiences from '/imports/api/creature/experience/Experiences';
import { removeCreatureWork } from '/imports/api/creature/creatures/methods/removeCreature';
import ArchiveCreatureFiles from '/imports/api/creature/archive/ArchiveCreatureFiles';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import { getUserFileStorageError } from '/imports/api/users/methods/updateFileStorageUsed';

export async function getArchiveObj(creatureId) {
  // Build the archive document
  const creature = await Creatures.findOneAsync(creatureId);
  if (!creature) throw new Meteor.Error('creature-not-found', 'Creature not found');
  const properties = await CreatureProperties.find({ ...getFilter.descendantsOfRoot(creatureId) }).fetchAsync();
  const experiences = await Experiences.find({ creatureId }).fetchAsync();
  const logs = await CreatureLogs.find({ creatureId }).fetchAsync();
  let archiveCreature = {
    meta: {
      type: 'DiceCloud V2 Creature Archive',
      schemaVersion: SCHEMA_VERSION,
      archiveDate: new Date(),
    },
    creature,
    properties,
    experiences,
    logs,
  };

  return archiveCreature;
}

export async function archiveCreature(creatureId) {
  const archive = await getArchiveObj(creatureId);
  const buffer = Buffer.from(JSON.stringify(archive, null, 2));
  // Archives count towards the owner's file storage limit. Writing on the
  // server skips the collection's onBeforeUpload, so check it here.
  const storageError = await getUserFileStorageError(archive.creature.owner, buffer.length);
  if (storageError) throw new Meteor.Error('Storage limit reached', storageError);
  // With S3, the character is only removed once its archive is stored there:
  // onAfterUpload starts the upload and emits 's3Result' when it is done. The
  // listener goes in before the write, keyed by an id chosen here, so an
  // early result cannot be missed.
  const fileId = Random.id();
  let onS3Result;
  const s3Upload = Meteor.settings.useS3 && new Promise((resolve, reject) => {
    onS3Result = (s3Error, resultRef) => {
      if (resultRef?._id !== fileId) return;
      if (s3Error) reject(s3Error);
      else resolve(resultRef);
    };
    ArchiveCreatureFiles.on('s3Result', onS3Result);
  });
  try {
    // writeAsync: ostrio:files 3 has no write()
    const fileRef = await ArchiveCreatureFiles.writeAsync(buffer, {
      fileId,
      fileName: `${archive.creature.name || archive.creature._id}.json`,
      type: 'application/json',
      userId: archive.creature.owner,
      meta: {
        schemaVersion: SCHEMA_VERSION,
        creatureId: archive.creature._id,
        creatureName: archive.creature.name,
      },
    }, true);
    const archivedRef = s3Upload ? await s3Upload : fileRef;
    await removeCreatureWork(creatureId);
    return archivedRef;
  } finally {
    if (onS3Result) ArchiveCreatureFiles.off('s3Result', onS3Result);
  }
}

const archiveCreatureToFile = new ValidatedMethod({
  name: 'Creatures.methods.archiveCreatureToFile',
  validate: new SimpleSchema({
    'creatureId': {
      type: String,
      max: 32,
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 10,
    timeInterval: 5000,
  },
  async run({ creatureId }) {
    await assertOwnership(creatureId, this.userId);
    if (Meteor.isServer) {
      await archiveCreature(creatureId);
    } else {
      await removeCreatureWork(creatureId);
    }
  },
});

export default archiveCreatureToFile;
