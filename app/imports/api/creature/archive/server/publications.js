import ArchiveCreatureFiles from '/imports/api/creature/archive/ArchiveCreatureFiles';
import { Meteor } from 'meteor/meteor';

Meteor.publish('archiveCreatureFiles', function () {
  return ArchiveCreatureFiles.find({
    userId: this.userId,
  }).cursor;
});
