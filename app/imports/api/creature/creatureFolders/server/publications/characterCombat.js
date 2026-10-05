import SimpleSchema from 'meteor/aldeed:simple-schema';
import { Meteor } from 'meteor/meteor';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';

const schema = new SimpleSchema({
  creatureId: { type: String, max: 32 },
});

/**
 * The fights a character is in, for its sheet (UX4): the party folders that
 * hold it and track initiative, with what the sheet's "your turn" banner
 * reads. For those who play the character (who can edit it); the folder's
 * invitation token stays out.
 */
Meteor.publish('characterCombat', function (creatureId) {
  try {
    schema.validate({ creatureId });
  } catch (e) {
    this.error(/** @type {Error} */ (e));
    return;
  }
  this.autorun(/** @this {{ userId: string | null }} */ async function () {
    const userId = this.userId;
    if (!userId) return [];
    const creature = await Creatures.findOneAsync(creatureId, {
      fields: { owner: 1, writers: 1, readers: 1, public: 1 },
    });
    const user = await Meteor.users.findOneAsync(userId, { fields: { roles: 1 } });
    if (!creature || !hasEditPermission(creature, user)) return [];
    return CreatureFolders.find({
      creatures: creatureId,
      'initiative.round': { $gt: 0 },
    }, {
      fields: { name: 1, owner: 1, members: 1, creatures: 1, initiative: 1 },
    });
  });
});
