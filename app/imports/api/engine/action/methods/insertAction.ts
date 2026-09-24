import { ValidatedMethod } from 'meteor/mdg:validated-method';
import SimpleSchema from 'meteor/aldeed:simple-schema';
import EngineActions, { EngineAction, ActionSchema } from '/imports/api/engine/action/EngineActions';
import { assertEditPermission } from '/imports/api/sharing/sharingPermissions';
import { getCreature } from '/imports/api/engine/loadCreatures';

export const insertAction = new ValidatedMethod({
  name: 'actions.insertAction',
  validate: new SimpleSchema({
    action: ActionSchema
  }).validator({ clean: true }),
  rateLimit: {
    numRequests: 5,
    timeInterval: 1000,
  },
  run: async function ({ action }: { action: EngineAction }) {
    const creature = await getCreature(action.creatureId);
    await assertEditPermission(creature, this.userId);

    // Every targeted creature must exist and be editable by the user. In practice
    // the target is the acting creature itself (rests, attribute and skill
    // buttons); targeting other creatures was only possible inside tabletops,
    // which have been removed.
    if (action.task.targetIds) for (const targetId of action.task.targetIds) {
      const target = await getCreature(targetId);
      if (!target) {
        throw new Meteor.Error('not-found', 'Target creature does not exist');
      }
      await assertEditPermission(target, this.userId);
    }

    // First remove all other actions on this creature
    // only do one action at a time, don't wait for this to finish
    await EngineActions.removeAsync({ creatureId: action.creatureId });
    // Force a random id even if one was provided, we may use it later as the seed for PRNG
    delete action._id;
    return await EngineActions.insertAsync(action);
  },
});
