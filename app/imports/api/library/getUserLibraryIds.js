import LibraryCollections from '/imports/api/library/LibraryCollections';
import Libraries from '/imports/api/library/Libraries';
import { union } from 'lodash';
import { Meteor } from 'meteor/meteor';
import { readableBy } from '/imports/api/sharing/sharedFilters';

export default async function getUserLibraryIds(userId) {
  if (!userId) return [];
  const user = await Meteor.users.findOneAsync(userId);
  let subbedIds = user?.subscribedLibraries || [];
  const subCollections = user?.subscribedLibraryCollections || [];
  await LibraryCollections.find({
    ...readableBy(userId, subCollections)
  }, { fields: { libraries: 1 } }).forEachAsync(collection => {
    subbedIds = union(subbedIds, collection.libraries);
  });
  const libraryIds = await Libraries.find({
    ...readableBy(userId, subbedIds)
  }, {
    fields: { _id: 1 }
  }).mapAsync(lib => lib._id);
  return libraryIds;
}