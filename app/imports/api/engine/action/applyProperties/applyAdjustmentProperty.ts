import { EngineAction } from '/imports/api/engine/action/EngineActions';
import InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import { applyDefaultAfterPropTasks, applyTaskToEachTarget } from '/imports/api/engine/action/functions/applyTaskGroups';
import recalculateCalculation from '/imports/api/engine/action/functions/recalculateCalculation';
import { PropTask } from '/imports/api/engine/action/tasks/Task';
import TaskResult from '/imports/api/engine/action/tasks/TaskResult';
import applyTask from '/imports/api/engine/action/tasks/applyTask';
import { getSingleProperty, getVariables } from '/imports/api/engine/loadCreatures';
import getPropertyTitle from '/imports/api/utility/getPropertyTitle';
import { CreatureProperty } from '/imports/api/creature/creatureProperties/CreatureProperties';
import { Meteor } from 'meteor/meteor';
import { WHOLE } from '/imports/api/creature/log/logViews';
import { targetSight } from '/imports/api/engine/action/functions/hiddenStats';
import { logLine, msg } from '/imports/api/creature/log/logMessages';
import numberToSignedString from '/imports/api/utility/numberToSignedString';

export default async function applyAdjustmentProperty(
  task: PropTask, action: EngineAction, result: TaskResult, userInput: InputProvider
): Promise<void> {
  const prop = task.prop;

  if (prop.type !== 'adjustment') {
    throw new Meteor.Error('wrong-property', `Expected an adjustment, got ${prop.type} instead`);
  }

  const damageTargetIds = prop.target === 'self' ? [action.creatureId] : task.targetIds;

  if (damageTargetIds.length > 1) {
    return await applyTaskToEachTarget(action, task, damageTargetIds, userInput);
  }

  // Get the operation and value and push the damage hooks to the queue. The
  // actor's own property's errors
  if (!prop.amount) {
    result.appendLog({
      name: 'Error', i18n: { name: { key: 'logs.error' } },
      value: 'Attribute damage does not have an amount set',
      silenced: prop.silent,
      hiddenTargetView: WHOLE,
    }, damageTargetIds);
    return;
  }

  // Evaluate the amount
  await recalculateCalculation(prop.amount, action, 'reduce', userInput);
  const value = Number(prop.amount.value ?? 0);
  if (!isFinite(value)) {
    result.appendLog({
      name: 'Error', i18n: { name: { key: 'logs.error' } },
      value: 'Attribute damage does not have a finite amount set',
      silenced: prop.silent,
      hiddenTargetView: WHOLE,
    }, damageTargetIds);
    return;
  }

  if (damageTargetIds.length && damageTargetIds.length !== 1) {
    throw new Meteor.Error('1 target Expected', 'At this step, only a single target is supported');
  }
  const targetId = damageTargetIds[0];
  // A target hidden from the actor's readers, which the browser's simulation
  // leaves to the server: its stats unread, nothing changed on a guess
  const sight = await targetSight(action, targetId, userInput);
  if (sight === 'unresolved') {
    return await applyDefaultAfterPropTasks(action, prop, damageTargetIds, userInput);
  }
  let stat: CreatureProperty | undefined;
  if (targetId && prop.stat) {
    const statId = (await getVariables(targetId))?.[prop.stat]?._propId;
    stat = statId && await getSingleProperty(targetId, statId);
    if (!stat?.type) {
      // Whether the target has the stat: never for the readers it is hidden
      // from, an oracle of its sheet
      result.appendLog({
        name: 'Error', i18n: { name: { key: 'logs.error' } },
        value: `Could not apply attribute damage, creature does not have \`${prop.stat}\` set`,
        silenced: prop.silent,
      }, damageTargetIds);
      return;
    }
  }
  // A target hidden from the actor's readers, a game master's monster: they
  // read what the actor applied, the stat's name and the actor's own number,
  // "Strength −2", "Strength set to 10"; never the stat's value, before or
  // after, which the lines of the change say (its game master's alone). Said
  // whatever the change made of it: a line there only when the stat moved
  // would tell that it was at its limit
  if (sight === 'hidden' && stat) {
    const name = getPropertyTitle(stat);
    result.appendLog({
      ...logLine({
        name: getPropertyTitle(prop),
        value: prop.operation === 'set'
          ? msg('logs.adjustedTo', { name, value })
          : msg('logs.adjusted', { name, amount: numberToSignedString(-value) }),
        inline: true,
        silenced: prop.silent,
      }),
      hiddenTargetView: WHOLE,
    }, damageTargetIds);
  }
  await applyTask(action, {
    targetIds: damageTargetIds,
    subtaskFn: 'damageProp',
    params: {
      title: getPropertyTitle(prop),
      operation: prop.operation,
      value,
      targetProp: stat ?? { name: prop.stat ?? '' },
    },
  }, userInput);
  return await applyDefaultAfterPropTasks(action, prop, damageTargetIds, userInput);
}
