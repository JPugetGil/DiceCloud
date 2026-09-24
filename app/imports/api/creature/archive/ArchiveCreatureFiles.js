
import SimpleSchema from 'meteor/aldeed:simple-schema';
import { incrementFileStorageUsed } from '/imports/api/users/methods/updateFileStorageUsed';
import { CreaturePropertySchema } from '/imports/api/creature/creatureProperties/CreatureProperties';
import { CreatureSchema } from '/imports/api/creature/creatures/Creatures';
let createS3FilesCollection;
if (Meteor.isServer) {
  // require(), not import: this module is only pulled in on one side of the
  // wire, and a static import would bundle it into both
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  createS3FilesCollection = require('/imports/api/files/server/s3FileStorage').createS3FilesCollection
} else {
  // require(), not import: this module is only pulled in on one side of the
  // wire, and a static import would bundle it into both
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  createS3FilesCollection = require('/imports/api/files/client/s3FileStorage').createS3FilesCollection
}

const ArchiveCreatureFiles = createS3FilesCollection({
  collectionName: 'archiveCreatureFiles',
  storagePath: Meteor.isDevelopment ? '../../../../../fileStorage/archiveCreatures' : 'assets/app/archiveCreatures',
  onBeforeUpload(file) {
    // Allow upload files under 10MB, and only in json format
    if (file.size > 10485760) {
      return 'Please upload with size equal or less than 10MB';
    }
    // Make sure the user has enough space
    // Only accept JSON
    if (!/json/i.test(file.extension)) {
      return 'Please upload only a JSON file';
    }
    return true;
  },
  async onAfterUpload(file) {
    if (Meteor.isServer) await incrementFileStorageUsed(file.userId, file.size);
  }
});

let archiveSchema = new SimpleSchema({
  meta: {
    type: Object,
    blackbox: true,
  },
  creature: CreatureSchema,
  properties: {
    type: Array,
  },
  'properties.$': CreaturePropertySchema,
  experiences: {
    type: Array,
  },
  'experiences.$': {
    type: Object,
    blackbox: true,
  },
  logs: {
    type: Array,
  },
  'logs.$': {
    type: Object,
    blackbox: true,
  },
});

export default ArchiveCreatureFiles;
export { archiveSchema };
