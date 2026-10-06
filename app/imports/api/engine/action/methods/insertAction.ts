import { ValidatedMethod } from 'meteor/mdg:validated-method';
import SimpleSchema from 'meteor/aldeed:simple-schema';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Random } from 'meteor/random';
import EngineActions, { EngineAction, ActionSchema } from '/imports/api/engine/action/EngineActions';
import { assertEditPermission } from '/imports/api/sharing/sharingPermissions';
import { getCreature } from '/imports/api/engine/loadCreatures';
import removeActions from '/imports/api/engine/action/functions/removeActions';
import taskFromDatabase from '/imports/api/engine/action/functions/taskFromDatabase';
import { Meteor } from 'meteor/meteor';

export const insertAction = new ValidatedMethod({
  name: 'actions.insertAction',
  validate: new SimpleSchema({
    action: ActionSchema
  }).validator({ clean: true }),
  mixins: [RateLimiterMixin],
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

    // The properties the task names are the database's, not the client's
    // copies, which only its simulation applies
    if (!this.isSimulation) {
      action.task = await taskFromDatabase(action.task, action.creatureId);
    }

    // First remove all other actions on this creature: only one action at a
    // time. One whose dice were already revealed is logged as abandoned
    await removeActions({ creatureId: action.creatureId }, !this.isSimulation);

    // Force a random id even if one was provided
    delete action._id;
    // The dice come from a secret seed that only the server knows, drawn here
    // whatever the client sent; the client asks for its dice one roll at a time
    // (drawDice). The id is no seed: the client knows it in advance
    delete action.seed;
    delete action.revealedCursor;
    delete action.insertedAt;
    if (!this.isSimulation) {
      action.seed = Random.secret();
      // An action left in progress is removed after a while
      // (removeAbandonedActions)
      action.insertedAt = new Date();
    }
    // The id only: the seed is never sent to the client
    return await EngineActions.insertAsync(action);
  },
});
