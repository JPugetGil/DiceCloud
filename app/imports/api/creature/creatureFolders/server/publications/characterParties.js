import SimpleSchema from 'meteor/aldeed:simple-schema';
import { Meteor } from 'meteor/meteor';
import { AsyncTracker } from 'meteor/nachocodoner:reactive-publish';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import reactivePublication, { findOneReactive } from '/imports/api/utility/server/reactivePublication';
import transformedCursor from '/imports/api/utility/server/transformedCursor';
import { folderFieldsForPlayers, folderViews } from '/imports/api/creature/creatureFolders/initiativeCreatures';
import { hidesStatsFromPlayers } from '/imports/api/creature/creatureFolders/boardMonsters';

const schema = new SimpleSchema({
  creatureId: { type: String, max: 32 },
});

/**
 * The parties a character plays in, for its sheet's target picker (phase
 * 2.1 of the monsters): the party folders that hold it, whether they fight or
 * not, with who sits at the table and the initiative tracker, which says
 * whether a fight is on. characterCombat without its `round > 0`: the picker
 * opens by itself during a fight, and from "Target…" outside one, and then
 * subscribes to each party's board (partyBoard) for the creatures it offers.
 * For those who play the character (who can edit it), with whether the game
 * master lets the players target the monsters, and the encounter under way,
 * whose received entries its log offers to undo (encounters.ts); the
 * folder's invitation token stays out.
 */
Meteor.publish('characterParties', function (creatureId) {
  try {
    schema.validate({ creatureId });
  } catch (e) {
    this.error(/** @type {Error} */ (e));
    return;
  }
  reactivePublication(this, async function () {
    const userId = this.userId;
    if (!userId) return [];
    const creature = await findOneReactive(Creatures, creatureId, {
      fields: { owner: 1, writers: 1, readers: 1, public: 1 },
    });
    const user = await findOneReactive(Meteor.users, userId, { fields: { roles: 1 } });
    if (!creature || !hasEditPermission(creature, user)) return [];
    const selector = { creatures: creatureId, archived: { $ne: true } };
    // Who runs each folder and whose rolls its players see: read on these
    // fields alone, which a turn does not change
    const folders = await CreatureFolders.find(selector, { fields: { owner: 1, creatures: 1 } }).fetchAsync();
    const creatures = await Creatures.find(
      { _id: { $in: folders.flatMap(folder => folder.creatures || []) } }, { fields: { owner: 1, type: 1 } },
    ).fetchAsync();
    const views = folderViews(folders, creatures, hidesStatsFromPlayers, userId);
    // Made outside the computation, which would otherwise rerun at every turn.
    // The initiative rolls of the game master's creatures are theirs alone
    return AsyncTracker.nonreactive(() => transformedCursor(CreatureFolders.find(selector, {
      fields: {
        name: 1, owner: 1, members: 1, creatures: 1, initiative: 1, playersTargetMonsters: 1, encounterId: 1,
      },
    }), (fields, id) => views.get(id)?.runs ? fields : folderFieldsForPlayers(fields, views.get(id)?.shownIds ?? [])));
  });
});
