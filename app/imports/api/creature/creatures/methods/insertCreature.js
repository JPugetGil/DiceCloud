import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import simpleSchemaMixin from '/imports/api/creature/mixins/simpleSchemaMixin';
import Creatures, { CreatureSchema } from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import defaultCharacterProperties from '/imports/api/creature/creatures/defaultCharacterProperties';
import insertPropertyFromLibraryNode from '/imports/api/creature/creatureProperties/methods/insertPropertyFromLibraryNode';
import getSlotFillFilter from '/imports/api/creature/creatureProperties/methods/getSlotFillFilter';
import getCreatureLibraryIds from '/imports/api/library/getCreatureLibraryIds';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import { insertExperienceForCreature } from '/imports/api/creature/experience/Experiences';
import { assertCanCreateCharacter } from '/imports/api/users/assertRolePermissions';
import SimpleSchema from 'meteor/aldeed:simple-schema';
import { Meteor } from 'meteor/meteor';

const insertCreature = new ValidatedMethod({
  name: 'creatures.insertCreature',
  mixins: [RateLimiterMixin, simpleSchemaMixin],
  validate: CreatureSchema.pick(
    'name',
    'gender',
    'alignment',
    'picture',
    'avatarPicture',
    'color',
    'allowedLibraries',
    'allowedLibraryCollections',
  ).extend({
    'startingLevel': {
      type: SimpleSchema.Integer,
      min: 0,
    },
    // The ruleset chosen at creation: a library node that fills the Ruleset slot
    'rulesetId': {
      type: String,
      max: 32,
      optional: true,
    },
    // An empty sheet, on purpose: no ruleset, even if the user follows only one
    'withoutRuleset': {
      type: Boolean,
      optional: true,
    },
  }).validator(),
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },

  async run({ name, gender, alignment, picture, avatarPicture, color, startingLevel,
    allowedLibraries, allowedLibraryCollections, rulesetId, withoutRuleset }) {
    const userId = this.userId
    if (!userId) {
      throw new Meteor.Error('Creatures.methods.insert.denied',
        'You need to be logged in to insert a creature');
    }
    // Server only: the client may not have all of the user's characters loaded
    if (Meteor.isServer) {
      await assertCanCreateCharacter(userId);
    }

    // Create the creature document
    let creatureId = await Creatures.insertAsync({
      owner: userId,
      name,
      gender,
      alignment,
      picture,
      avatarPicture,
      color,
      type: 'pc',
      allowedLibraries,
      allowedLibraryCollections,
      settings: {},
      readers: [],
      writers: [],
      public: false,
    });

    // Insert experience to get character to starting level
    if (startingLevel) {
      await insertExperienceForCreature({
        experience: {
          name: 'Starting level',
          levels: startingLevel,
          creatureId
        },
        creatureId,
      });
    }

    // Insert the default properties
    // Not batchInsert because we want the properties cleaned by the schema
    let baseId, rulesetSlot;
    // for...of rather than forEach: an async callback handed to forEach is never
    // awaited, so baseId and rulesetSlot were still unset by the time the code
    // below read them.
    for (const prop of defaultCharacterProperties(creatureId)) {
      let id = await CreatureProperties.insertAsync(prop);
      if (prop.name === 'Ruleset') {
        baseId = id;
        rulesetSlot = prop;
      }
    }

    // The ruleset chosen, or the only one the user follows
    if (Meteor.isServer && !withoutRuleset) {
      await insertDefaultRuleset(creatureId, baseId, userId, rulesetSlot, rulesetId);
    }

    return creatureId;
  },
});

/**
 * Fills the Ruleset slot: with the ruleset chosen at creation, if the
 * character's libraries hold it; otherwise with the only ruleset they hold.
 * With English and French rulesets followed, the slot used to stay empty
 */
async function insertDefaultRuleset(creatureId, baseId, userId, slot, rulesetId) {
  const libraryIds = await getCreatureLibraryIds(creatureId, userId);
  const filter = getSlotFillFilter({ slot, libraryIds });
  const chosen = rulesetId && await LibraryNodes.findOneAsync({ ...filter, _id: rulesetId }, { fields: { _id: 1 } });
  const fillCursor = LibraryNodes.find(filter, { fields: { _id: 1 } });
  const ruleset = chosen || (await fillCursor.countAsync() === 1 && (await fillCursor.fetchAsync())[0]);
  if (ruleset) {
    // Awaited: the method is async, and a call left running on its own lost any
    // error and returned the new creature before its ruleset had landed
    await insertPropertyFromLibraryNode.callAsync({
      nodeIds: [ruleset._id],
      parentRef: { id: baseId, collection: 'creatureProperties' },
    });
  }
}

export default insertCreature;
