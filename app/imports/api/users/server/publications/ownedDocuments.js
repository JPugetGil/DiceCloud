import Creatures from '/imports/api/creature/creatures/Creatures';
import Libraries from '/imports/api/library/Libraries';
import { Meteor } from 'meteor/meteor';
import { WITHOUT_WEBHOOK_URL } from '/imports/api/creature/creatures/webhookVisibility';

// Cursors and nothing else: their observers keep them up to date. An autorun
// here only left a run's observers running after the next one
Meteor.publish('ownedDocuments', function () {
  let userId = this.userId;
  if (!userId) {
    return [];
  }
  return [
    // Never a Discord webhook's URL, not even to its owner (webhookVisibility.ts)
    Creatures.find({ owner: userId }, { fields: WITHOUT_WEBHOOK_URL }),
    Libraries.find({ owner: userId }),
  ]
});
