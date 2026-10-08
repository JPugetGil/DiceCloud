import SimpleSchema from 'meteor/aldeed:simple-schema';
import { Meteor } from 'meteor/meteor';
import { AsyncTracker } from 'meteor/nachocodoner:reactive-publish';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import Libraries from '/imports/api/library/Libraries';
import computeCreature from '/imports/api/engine/computeCreature';
import { loadCreature } from '/imports/api/engine/loadCreatures';
import VERSION from '/imports/constants/VERSION';
import EngineActions, { WITHOUT_SEED } from '/imports/api/engine/action/EngineActions';
import { getPartyRole, partyCreaturesFilter } from '/imports/api/creature/creatureFolders/party';
import { boardFolderFields } from '/imports/api/creature/creatureFolders/initiativeCreatures';
import { settingsFieldsWithoutWebhook } from '/imports/api/creature/creatures/webhookVisibility';
import { hidesStatsFromPlayers } from '/imports/api/creature/creatureFolders/boardMonsters';
import reactivePublication, { findOneReactive } from '/imports/api/utility/server/reactivePublication';

const schema = new SimpleSchema({
  folderId: { type: String, max: 32 },
});

// What the publication reads of the folder, and reruns on: not the initiative
// tracker, which changes every turn
const FOLDER_FIELDS = { owner: 1, members: 1, creatures: 1 };

// The stats a party board shows, by variable name
const BOARD_VARIABLES = ['armor', 'speed', 'initiative', 'perception'];

// What the game master sees of the party's characters: their settings, which
// a rest started from the board reads, but not the Discord webhook. The game
// master may only read some of them, and one cursor cannot tell them apart
const CREATURE_FIELDS = {
  name: 1, color: 1, picture: 1, avatarPicture: 1, owner: 1, readers: 1, writers: 1,
  public: 1, type: 1, computeVersion: 1, templateId: 1, ...settingsFieldsWithoutWebhook(),
};

// What players see of the party's characters: no settings, which hold the
// Discord webhook, nor who else they are shared with. Nothing of a monster's
// stats either: they are not on the creature document
const MEMBER_CREATURE_FIELDS = {
  name: 1, color: 1, picture: 1, avatarPicture: 1, owner: 1, writers: 1, type: 1, computeVersion: 1,
};

const PROPERTY_FIELDS = {
  root: 1, parentId: 1, left: 1, right: 1, type: 1, name: 1, variableName: 1,
  attributeType: 1, value: 1, total: 1, damage: 1, modifier: 1, passiveBonus: 1,
  level: 1, color: 1, icon: 1, removed: 1, inactive: 1, overridden: 1,
  healthBarColorMid: 1, healthBarColorLow: 1, healthBarNoDamage: 1, healthBarNoHealing: 1,
  hideRemoveButton: 1, decimal: 1, ignoreLowerLimit: 1, ignoreUpperLimit: 1, unit: 1,
  // Effects' durations, which the initiative tracker counts down
  duration: 1, durationSpent: 1,
};

/**
 * A character folder as a party board, for its owner (the game master) and
 * the players who joined it: its characters (see partyCreaturesFilter), with
 * the properties the board shows (health bars, AC, speed, initiative, passive
 * Perception, classes, buffs and conditions), and their variables and actions
 * in progress, which the board's damage and healing actions read. Also the
 * names of the game master and the players. The invitation link's token is
 * the game master's alone.
 *
 * Of the game master's monsters and non-player characters (boardMonsters.js),
 * the game master also gets the bestiary templates the monsters were copied
 * from; the players get the name, picture and type, and the conditions: no hit
 * points, no other property, no variables, no action in progress. Each of
 * those is a document of its own, which a cursor sends or doesn't: the
 * mergebox merges by top-level field, and could not hide part of one.
 */
Meteor.publish('partyBoard', function (folderId) {
  const self = this;
  try {
    schema.validate({ folderId });
  } catch (e) {
    this.error(e);
    return;
  }
  reactivePublication(this, async function ({ firstRun }) {
    const userId = this.userId;
    if (!userId) return [];
    const folder = await findOneReactive(CreatureFolders, folderId, { fields: FOLDER_FIELDS });
    const role = getPartyRole(folder, userId);
    if (!folder || !role) return [];
    // Whether the game master shows the players the stats of the creatures
    // added by hand: read apart, a combat that starts or ends changes nothing
    const showStats = !!await findOneReactive(
      CreatureFolders, { _id: folderId, 'initiative.showStats': true }, { fields: { _id: 1 } },
    );
    const creatures = await Creatures.find(
      partyCreaturesFilter(folder, userId), { fields: { computeVersion: 1, type: 1, templateId: 1 } },
    ).fetchAsync();
    const creatureIds = creatures.map(creature => creature._id);
    // Those whose stats the viewer sees: all of them for the game master
    const shown = role === 'gm' ? creatures : creatures.filter(creature => !hidesStatsFromPlayers(creature));
    const shownIds = shown.map(creature => creature._id);
    const conditionsOnlyIds = creatureIds.filter(id => !shownIds.includes(id));
    // The bestiary templates of the game master's monsters: their type line and
    // lore, and their libraries' licence
    const templateIds = role === 'gm'
      ? [...new Set(creatures.map(creature => creature.templateId).filter(Boolean))]
      : [];
    const templateLibraryIds = templateIds.length ? [...new Set((await AsyncTracker.nonreactive(
      () => LibraryNodes.find({ _id: { $in: templateIds } }, { fields: { root: 1 } }).fetchAsync(),
    )).map(template => template.root?.id).filter(Boolean))] : [];
    // The creatures' caches observe their documents for good: outside the
    // computation, or their first change reruns the board
    await AsyncTracker.nonreactive(() => shown.forEach(creature => loadCreature(creature._id, self)));
    shown.forEach(creature => {
      // Not awaited, as in singleCharacter: the results arrive through the cursors
      if (creature.computeVersion !== VERSION && firstRun) {
        computeCreature(creature._id).catch(e => console.error(e));
      }
    });
    // Made outside the computation: under reactive-publish, a cursor made in
    // it reruns it whenever one of its documents changes, and a rerun sends
    // every document of every cursor again, the properties and variables
    // reaching the client again (no server merge, publicationStrategies.js).
    // Each turn and each hit point sent the game master 190 KB on a board of
    // 30 goblins (2026-10-07)
    return AsyncTracker.nonreactive(() => [
      // The players get neither the invitation's token nor, unless the game
      // master shows them, the hit points and armor class of the creatures
      // added to the initiative tracker (UX11), which tell their status too
      CreatureFolders.find({ _id: folderId }, {
        fields: boardFolderFields(role, { initiative: { showStats } }),
      }),
      Creatures.find({ _id: { $in: creatureIds } }, {
        fields: role === 'gm' ? CREATURE_FIELDS : MEMBER_CREATURE_FIELDS,
      }),
      Meteor.users.find(
        { _id: { $in: [folder.owner, ...(folder.members || [])] } }, { fields: { username: 1 } },
      ),
      CreatureVariables.find({ _creatureId: { $in: shownIds } }),
      // The actions in progress, which doAction reads back once it inserts one;
      // never the dice's secret seed (EngineActions.ts)
      EngineActions.find({ creatureId: { $in: shownIds } }, { fields: WITHOUT_SEED }),
      CreatureProperties.find({
        removed: { $ne: true },
        $or: [{
          'root.id': { $in: shownIds },
          $or: [
            { type: 'attribute', attributeType: 'healthBar' },
            { variableName: { $in: BOARD_VARIABLES } },
            { type: 'class' },
            { type: 'buff' },
          ],
        }, {
          // The conditions it is under, which the players act on: the buffs
          // its libraries tag `condition` (conditions.js), without their effects
          'root.id': { $in: conditionsOnlyIds },
          type: 'buff',
          tags: 'condition',
          inactive: { $ne: true },
        }],
      }, { fields: PROPERTY_FIELDS }),
      LibraryNodes.find({ _id: { $in: templateIds } }, {
        fields: { type: 1, name: 1, description: 1, libraryTags: 1, root: 1 },
      }),
      Libraries.find({ _id: { $in: templateLibraryIds } }, { fields: { name: 1, license: 1 } }),
    ]);
  });
});
