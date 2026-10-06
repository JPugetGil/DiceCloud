import { ValidatedMethod } from 'meteor/mdg:validated-method';
import SimpleSchema from 'meteor/aldeed:simple-schema';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Random } from 'meteor/random';
import EngineActions, { EngineAction, ActionSchema } from '/imports/api/engine/action/EngineActions';
import { assertEditPermission } from '/imports/api/sharing/sharingPermissions';
import { getCreature, getVariables } from '/imports/api/engine/loadCreatures';
import { getFromScope } from '/imports/api/creature/creatures/CreatureVariables';
import { insertCreatureLogWork } from '/imports/api/creature/log/CreatureLogs';
import { logLine, msg, type LogParam } from '/imports/api/creature/log/logMessages';
import getPropertyTitle from '/imports/api/utility/getPropertyTitle';
import type Task from '/imports/api/engine/action/tasks/Task';
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

    // First remove all other actions on this creature: only one action at a
    // time. One whose dice were already revealed is logged as abandoned
    await removeActionsOf(action.creatureId, !this.isSimulation);

    // Force a random id even if one was provided
    delete action._id;
    // The dice come from a secret seed that only the server knows, drawn here
    // whatever the client sent; the client asks for its dice one roll at a time
    // (drawDice). The id is no seed: the client knows it in advance
    delete action.seed;
    delete action.revealedCursor;
    if (!this.isSimulation) action.seed = Random.secret();
    // The id only: the seed is never sent to the client
    return await EngineActions.insertAsync(action);
  },
});

/**
 * Removes the creature's actions in progress. On the server, an action whose
 * dice the client has seen (drawDice) and that never ran is logged in the
 * creature's log as abandoned, so that rolling again until the dice suit
 * leaves a trace; one abandoned before any die was drawn is not.
 *
 * Each action is removed only while its revealed dice are as they were read:
 * a die drawn meanwhile makes it read again, and a die drawn after the
 * removal finds no action and is not revealed.
 */
async function removeActionsOf(creatureId: string, logAbandoned: boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const previous = await EngineActions.findOneAsync(
      { creatureId }, { fields: { task: 1, revealedCursor: 1 } },
    );
    if (!previous?._id) return;
    const removed = await EngineActions.removeAsync({
      _id: previous._id,
      revealedCursor: previous.revealedCursor === undefined ? { $exists: false } : previous.revealedCursor,
    });
    if (removed && logAbandoned && previous.revealedCursor) {
      await logAbandonedAction(creatureId, previous.task);
    }
  }
  // Never reached in practice: dice drawn without end
  await EngineActions.removeAsync({ creatureId });
}

async function logAbandonedAction(creatureId: string, task: Task) {
  await insertCreatureLogWork({
    log: {
      creatureId,
      content: [logLine({
        name: msg('logs.actionAbandoned', { name: await taskName(creatureId, task) }),
      })],
    },
  });
}

// What the log calls an action's task, as its own lines would
async function taskName(creatureId: string, task: Task): Promise<LogParam> {
  if (!task) return msg('logs.roll');
  if ('prop' in task && task.prop) return getPropertyTitle(task.prop);
  switch (task.subtaskFn) {
    case 'check': {
      const scope = await getVariables(creatureId);
      const skill = task.skillVariableName && await getFromScope(task.skillVariableName, scope);
      const ability = task.abilityVariableName && await getFromScope(task.abilityVariableName, scope);
      if (ability?.name && skill?.name) return `${ability.name} (${skill.name})`;
      return ability?.name || skill?.name || msg('logs.check');
    }
    case 'reset':
      if (task.eventName === 'shortRest') return msg('logs.shortRest');
      if (task.eventName === 'longRest') return msg('logs.longRest');
      return task.eventName || msg('logs.roll');
    case 'dealDamage':
      return msg(task.params?.damageType === 'healing' ? 'logs.healing' : 'logs.damage');
    case 'damageProp':
      return task.params?.title || msg('logs.damage');
    default:
      return msg('logs.roll');
  }
}
