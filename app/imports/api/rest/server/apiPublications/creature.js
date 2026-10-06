import SimpleSchema from 'meteor/aldeed:simple-schema';
import { JsonRoutes } from 'meteor/simple:json-routes';
import { assertViewPermission } from '/imports/api/creature/creatures/creaturePermissions';
import computeCreature from '/imports/api/engine/computeCreature';
import VERSION from '/imports/constants/VERSION';
import { getCreature, getProperties, getVariables } from '/imports/api/engine/loadCreatures';
import SCHEMA_VERSION from '/imports/constants/SCHEMA_VERSION';
import { Meteor } from 'meteor/meteor';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import { creatureWithoutWebhook } from '/imports/api/creature/creatures/webhookVisibility';

JsonRoutes.add('get', 'api/creature/:id', async function (req, res) {
  const creatureId = req.params.id;

  // Validate the creature ID
  try {
    new SimpleSchema({
      creatureId: {
        type: String,
        max: 32,
      },
    }).validate({ creatureId });
  } catch {
    const error = new Meteor.Error('invalid-id', 'Invalid creature ID provided');
    error.statusCode = 400;
    throw error;
  }

  // Check permissions
  const creature = await getCreature(creatureId);
  const userId = req.userId;
  try {
    await assertViewPermission(creature, userId)
  } catch (e) {
    e.statusCode = 403;
    throw e;
  }

  // Compute the creature first if need be
  if (creature.computeVersion !== VERSION) {
    try {
      await computeCreature(creatureId)
    } catch (e) {
      e.statusCode = 500;
      console.error(e)
      throw e;
    }
  }

  // The Discord webhook only for those who may edit the character: a public
  // character is read here without any token
  const user = userId && await Meteor.users.findOneAsync(userId, { fields: { roles: 1 } });
  const sentCreature = hasEditPermission(creature, user) ? creature : creatureWithoutWebhook(creature);

  // Send the results
  JsonRoutes.sendResult(res, {
    data: {
      meta: {
        schemaVersion: SCHEMA_VERSION,
      },
      creatures: [sentCreature],
      creatureProperties: await getProperties(creatureId),
      creatureVariables: await getVariables(creatureId),
    },
  });

});
