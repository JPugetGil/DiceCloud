
import SimpleSchema from 'meteor/aldeed:simple-schema';
import { incrementFileStorageUsed, getUserFileStorageError } from '/imports/api/users/methods/updateFileStorageUsed';
import { CreaturePropertySchema } from '/imports/api/creature/creatureProperties/CreatureProperties';
import { CreatureSchema } from '/imports/api/creature/creatures/Creatures';
import { Meteor } from 'meteor/meteor';
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
  /** @this {{ userId?: string | null }} */
  async onBeforeUpload(file) {
    // Allow upload files under 10MB, and only in json format
    if (file.size > 10485760) {
      return 'Please upload with size equal or less than 10MB';
    }
    // Only accept JSON
    if (!/json/i.test(file.extension)) {
      return 'Please upload only a JSON file';
    }
    // Make sure the user has enough space left in their role's storage limit.
    // The server checks the uploading user, the client the logged in one.
    const userId = Meteor.isServer ? this.userId : Meteor.userId();
    return await getUserFileStorageError(userId, file.size) ?? true;
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
