
import { incrementFileStorageUsed, getUserFileStorageError } from '/imports/api/users/methods/updateFileStorageUsed';
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

const UserImages = createS3FilesCollection({
  collectionName: 'userImages',
  storagePath: Meteor.isDevelopment ? '../../../../../fileStorage/userImages' : 'assets/app/userImages',
  async onBeforeUpload(this: { userId?: string | null }, file) {
    // Allow upload files under 30MB
    if (file.size > 30_000_000) {
      return 'Images must be less than 30MB';
    }
    // Allow common image extensions
    if (!/gif|png|jpe?g|webp/i.test(file.extension || '')) {
      return 'Please upload an image file only';
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

import './methods';
import { Meteor } from 'meteor/meteor';

export default UserImages;
