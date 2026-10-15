import TaskResult, { LogContent } from '../tasks/TaskResult';
import { EngineAction } from '/imports/api/engine/action/EngineActions';
import { applyDefaultAfterPropTasks } from '/imports/api/engine/action/functions/applyTaskGroups';
import recalculateCalculation from '/imports/api/engine/action/functions/recalculateCalculation';
import recalculateInlineCalculations from '/imports/api/engine/action/functions/recalculateInlineCalculations';
import { PropTask } from '/imports/api/engine/action/tasks/Task';
import getPropertyTitle from '/imports/api/utility/getPropertyTitle';
import { Meteor } from 'meteor/meteor';
import { WHOLE, nameOnly } from '/imports/api/creature/log/logViews';

export default async function applyTriggerProperty(
  task: PropTask, action: EngineAction, result: TaskResult, userInput
): Promise<void> {
  const prop = task.prop;

  if (prop.type !== 'trigger') {
    throw new Meteor.Error('wrong-property', `Expected a trigger, got ${prop.type} instead`);
  }

  // A trigger fires only while its condition holds. Evaluated now, not when
  // the sheet was computed: it sees what the action has changed so far, such
  // as the attribute whose damage fired it
  if (prop.condition?.calculation) {
    await recalculateCalculation(prop.condition, action, 'reduce', userInput);
    if (!prop.condition.value) return;
  }

  // A target's players read its name: its description is the actor's. The
  // actor's own readers read it whole, when it is the actor's trigger: a
  // target's own triggers fire in a pass of their own, on its behalf
  // (ReceivedDamageTask), and never show to those it is hidden from
  const logContent: LogContent & { silenced: boolean | undefined } = {
    name: getPropertyTitle(prop),
    silenced: prop.silent,
    targetView: nameOnly({ name: getPropertyTitle(prop) }),
    ...prop.root?.id === action.creatureId && { hiddenTargetView: WHOLE },
  }

  // Add the trigger description to the log
  if (prop.description?.text) {
    await recalculateInlineCalculations(prop.description, action, 'reduce', userInput);
    if (prop.description.value) {
      logContent.value = prop.description.value;
    }
  }

  result.appendLog(logContent, task.targetIds);
  return await applyDefaultAfterPropTasks(action, prop, task.targetIds, userInput);
}
