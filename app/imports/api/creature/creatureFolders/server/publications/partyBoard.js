import SimpleSchema from 'meteor/aldeed:simple-schema';
import { Meteor } from 'meteor/meteor';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import computeCreature from '/imports/api/engine/computeCreature';
import { loadCreature } from '/imports/api/engine/loadCreatures';
import VERSION from '/imports/constants/VERSION';
import EngineActions from '/imports/api/engine/action/EngineActions';

const schema = new SimpleSchema({
  folderId: { type: String, max: 32 },
});

// The stats a party board shows, by variable name
const BOARD_VARIABLES = ['armor', 'speed', 'initiative', 'perception'];

const CREATURE_FIELDS = {
  name: 1, color: 1, picture: 1, avatarPicture: 1, owner: 1, readers: 1, writers: 1,
  public: 1, type: 1, settings: 1, computeVersion: 1,
};

const PROPERTY_FIELDS = {
  root: 1, parentId: 1, left: 1, right: 1, type: 1, name: 1, variableName: 1,
  attributeType: 1, value: 1, total: 1, damage: 1, modifier: 1, passiveBonus: 1,
  level: 1, color: 1, icon: 1, removed: 1, inactive: 1, overridden: 1,
  healthBarColorMid: 1, healthBarColorLow: 1, healthBarNoDamage: 1, healthBarNoHealing: 1,
  hideRemoveButton: 1, decimal: 1, ignoreLowerLimit: 1, ignoreUpperLimit: 1, unit: 1,
};

/**
 * A character folder as a party board, for its owner: its characters they
 * can view, with the properties the board shows (health bars, AC, speed,
 * initiative, passive Perception, classes, buffs and conditions), and their
 * variables and actions in progress, which the board's damage and healing
 * actions read.
 */
Meteor.publish('partyBoard', function (folderId) {
  const self = this;
  try {
    schema.validate({ folderId });
  } catch (e) {
    this.error(e);
    return;
  }
  this.autorun(async function (computation) {
    const userId = this.userId;
    if (!userId) return [];
    const folder = await CreatureFolders.findOneAsync({ _id: folderId, owner: userId });
    if (!folder) return [];
    const creatures = await Creatures.find({
      _id: { $in: folder.creatures || [] },
      $or: [{ owner: userId }, { readers: userId }, { writers: userId }, { public: true }],
    }, { fields: { computeVersion: 1 } }).fetchAsync();
    const creatureIds = creatures.map(creature => creature._id);
    creatures.forEach(creature => {
      loadCreature(creature._id, self);
      // Not awaited, as in singleCharacter: the results arrive through the cursors
      if (creature.computeVersion !== VERSION && computation.firstRun) {
        computeCreature(creature._id).catch(e => console.error(e));
      }
    });
    return [
      CreatureFolders.find({ _id: folderId }),
      Creatures.find({ _id: { $in: creatureIds } }, { fields: CREATURE_FIELDS }),
      CreatureVariables.find({ _creatureId: { $in: creatureIds } }),
      // The actions in progress, which doAction reads back once it inserts one
      EngineActions.find({ creatureId: { $in: creatureIds } }),
      CreatureProperties.find({
        'root.id': { $in: creatureIds },
        removed: { $ne: true },
        $or: [
          { type: 'attribute', attributeType: 'healthBar' },
          { variableName: { $in: BOARD_VARIABLES } },
          { type: 'class' },
          { type: 'buff' },
        ],
      }, { fields: PROPERTY_FIELDS }),
    ];
  });
});
