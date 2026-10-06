import { Mongo } from 'meteor/mongo';
import EngineActions, { EngineAction } from '/imports/api/engine/action/EngineActions';
import { getVariables } from '/imports/api/engine/loadCreatures';
import { getFromScope } from '/imports/api/creature/creatures/CreatureVariables';
import { insertCreatureLogWork } from '/imports/api/creature/log/CreatureLogs';
import { logLine, msg, type LogParam } from '/imports/api/creature/log/logMessages';
import getPropertyTitle from '/imports/api/utility/getPropertyTitle';
import type Task from '/imports/api/engine/action/tasks/Task';

/**
 * Removes the actions in progress that the selector matches. With
 * `logAbandoned` (on the server), an action whose dice the client has seen
 * (drawDice) and that never ran is logged in its creature's log as abandoned,
 * so that rolling again until the dice suit leaves a trace; one abandoned
 * before any die was drawn is not. insertAction removes the creature's
 * previous action this way, and a periodic job the actions no other replaced
 * (server/removeAbandonedActions).
 *
 * Each action is removed only while its revealed dice are as they were read:
 * a die drawn meanwhile makes it read again, and a die drawn after the
 * removal finds no action and is not revealed.
 */
export default async function removeActions(
  selector: Mongo.Selector<EngineAction>, logAbandoned: boolean,
) {
  // Attempts at the same action, which dice drawn meanwhile kept changing
  let attempts = 0;
  for (;;) {
    const action = await EngineActions.findOneAsync(
      selector, { fields: { creatureId: 1, task: 1, revealedCursor: 1 } },
    );
    if (!action?._id) return;
    let removed = await EngineActions.removeAsync({
      _id: action._id,
      revealedCursor: action.revealedCursor === undefined ? { $exists: false } : action.revealedCursor,
    });
    if (!removed && ++attempts >= 100) {
      // Never reached in practice: dice drawn without end, so revealed
      removed = await EngineActions.removeAsync({ _id: action._id });
      action.revealedCursor = Math.max(action.revealedCursor ?? 0, 1);
    }
    if (!removed) continue;
    attempts = 0;
    if (logAbandoned && action.revealedCursor) {
      await logAbandonedAction(action.creatureId, action.task);
    }
  }
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
