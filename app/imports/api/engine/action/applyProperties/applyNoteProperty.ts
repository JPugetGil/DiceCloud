import type { EngineAction } from '/imports/api/engine/action/EngineActions';
import type InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import { applyDefaultAfterPropTasks } from '/imports/api/engine/action/functions/applyTaskGroups';
import recalculateInlineCalculations from '/imports/api/engine/action/functions/recalculateInlineCalculations';
import type { PropTask } from '/imports/api/engine/action/tasks/Task';
import type { LogContent } from '/imports/api/engine/action/tasks/TaskResult';
import type TaskResult from '/imports/api/engine/action/tasks/TaskResult';
import { Meteor } from 'meteor/meteor';
import { WHOLE, nameOnly } from '/imports/api/creature/log/logViews';

export default async function applyNoteProperty(
  task: PropTask, action: EngineAction, result: TaskResult, inputProvider: InputProvider
): Promise<void> {
  const prop = task.prop;

  if (prop.type !== 'note') {
    throw new Meteor.Error('wrong-property', `Expected a note, got ${prop.type} instead`);
  }

  const logContent: LogContent & { silenced: boolean | undefined; } = {
    silenced: prop.silent,
  };
  if (prop.name) {
    logContent.name = prop.name;
    // A target's players read its name: its text is the actor's, often a
    // stat block's, with its numbers ("DC 13, 7 (2d6) poison damage")
    logContent.targetView = nameOnly({ name: prop.name });
  }
  // The actor's own readers read it whole, whoever it targets: its
  // calculations read the actor's scope, which holds nothing of a target
  // hidden from them but the results (logViews.ts)
  logContent.hiddenTargetView = WHOLE;
  if (prop.summary?.text) {
    await recalculateInlineCalculations(prop.summary, action, 'reduce', inputProvider);
    logContent.value = prop.summary.value;
  }

  if (logContent.name || logContent.value) {
    result.appendLog(logContent, task.targetIds);
  }
  // Log description
  if (prop.description?.text) {
    await recalculateInlineCalculations(prop.description, action, 'reduce', inputProvider);
    result.appendLog({
      value: prop.description.value,
      silenced: prop.silent,
      hiddenTargetView: WHOLE,
    }, task.targetIds);
  }
  return await applyDefaultAfterPropTasks(action, prop, task.targetIds, inputProvider);
}
