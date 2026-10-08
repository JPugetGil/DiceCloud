import Creatures from '/imports/api/creature/creatures/Creatures';
import Libraries from '/imports/api/library/Libraries';
import { Meteor } from 'meteor/meteor';

// Cursors and nothing else: their observers keep them up to date. An autorun
// here only left a run's observers running after the next one
Meteor.publish('ownedDocuments', function () {
  let userId = this.userId;
  if (!userId) {
    return [];
  }
  return [
    Creatures.find({ owner: userId }),
    Libraries.find({ owner: userId }),
  ]
});
