import SimpleSchema from 'meteor/aldeed:simple-schema';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import { assertViewPermission } from '/imports/api/creature/creatures/creaturePermissions';
import computeCreature from '/imports/api/engine/computeCreature';
import VERSION from '/imports/constants/VERSION';
import { loadCreature } from '/imports/api/engine/loadCreatures';
import { rebuildCreatureNestedSets } from '/imports/api/parenting/parentingFunctions';
import EngineActions from '/imports/api/engine/action/EngineActions';

let schema = new SimpleSchema({
  creatureId: {
    type: String,
    max: 32,
  },
});

Meteor.publish('singleCharacter', function (creatureId) {
  const self = this;
  try {
    schema.validate({ creatureId });
  } catch (e) {
    this.error(e);
  }
  this.autorun(async function (computation) {
    let userId = this.userId;
    let permissionCreature = await Creatures.findOneAsync({
      _id: creatureId,
    }, {
      fields: {
        owner: 1,
        readers: 1,
        writers: 1,
        public: 1,
        computeVersion: 1,
      }
    });
    try { await assertViewPermission(permissionCreature, userId) }
    catch { return [] }
    loadCreature(creatureId, self);
    if (permissionCreature?.computeVersion !== VERSION && computation.firstRun) {
      // Not awaited, as before Meteor 3: the results reach the client through
      // the cursors below as they land. Blocking the first run on it made the
      // first open of a newly created character never become ready -- the
      // compute finished, but the subscription never did.
      rebuildCreatureNestedSets(creatureId)
        .then(() => computeCreature(creatureId))
        .catch(e => console.error(e));
    }
    return [
      Creatures.find({
        _id: creatureId,
      }),
      CreatureVariables.find({
        _creatureId: creatureId,
      }),
      CreatureProperties.find({
        'root.id': creatureId,
      }),
      CreatureLogs.find({
        creatureId,
      }, {
        limit: 20,
        sort: { date: -1 },
      }),
      EngineActions.find({
        creatureId,
      }),
      // Also publish the owner's username
      Meteor.users.find(permissionCreature.owner, {
        fields: {
          username: 1,
        },
      }),
    ];
  });
});
