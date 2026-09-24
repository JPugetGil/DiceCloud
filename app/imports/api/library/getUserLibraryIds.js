import LibraryCollections from '/imports/api/library/LibraryCollections';
import Libraries from '/imports/api/library/Libraries';
import { union } from 'lodash';

export default async function getUserLibraryIds(userId) {
  if (!userId) return [];
  const user = await Meteor.users.findOneAsync(userId);
  let subbedIds = user?.subscribedLibraries || [];
  const subCollections = user?.subscribedLibraryCollections || [];
  await LibraryCollections.find({
    $or: [
      { owner: userId },
      { writers: userId },
      { readers: userId },
      { _id: { $in: subCollections }, public: true },
    ]
  }, { fields: { libraries: 1 } }).forEachAsync(collection => {
    subbedIds = union(subbedIds, collection.libraries);
  });
  const libraryIds = await Libraries.find({
    $or: [
      { owner: userId },
      { writers: userId },
      { readers: userId },
      { _id: { $in: subbedIds }, public: true },
    ]
  }, {
    fields: { _id: 1 }
  }).mapAsync(lib => lib._id);
  return libraryIds;
}