import type { EngineAction } from '/imports/api/engine/action/EngineActions';
import type InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import { applyAfterTasksSkipChildren, applyDefaultAfterPropTasks } from '/imports/api/engine/action/functions/applyTaskGroups';
import recalculateCalculation from '/imports/api/engine/action/functions/recalculateCalculation';
import type { PropTask } from '/imports/api/engine/action/tasks/Task';
import type TaskResult from '/imports/api/engine/action/tasks/TaskResult';
import { Meteor } from 'meteor/meteor';
import { WHOLE } from '/imports/api/creature/log/logViews';

export default async function applyToggle(
  task: PropTask, action: EngineAction, result: TaskResult, inputProvider: InputProvider
): Promise<void> {

  const prop = task.prop;

  if (prop.type !== 'toggle') {
    throw new Meteor.Error('wrong-property', `Expected a toggle, got ${prop.type} instead`);
  }

  if (!prop.condition) {
    // The actor's own property's error
    result.appendLog({
      name: 'Toggle error', i18n: { name: { key: 'logs.toggleError' } },
      value: 'toggle does not have a condition set',
      silenced: prop.silent,
      hiddenTargetView: WHOLE,
    }, task.targetIds);
    return await applyAfterTasksSkipChildren(action, prop, task.targetIds, inputProvider);
  }

  await recalculateCalculation(prop.condition, action, 'reduce', inputProvider);
  if (prop.condition?.value) {
    return await applyDefaultAfterPropTasks(action, prop, task.targetIds, inputProvider);
  } else {
    return await applyAfterTasksSkipChildren(action, prop, task.targetIds, inputProvider);
  }
}
