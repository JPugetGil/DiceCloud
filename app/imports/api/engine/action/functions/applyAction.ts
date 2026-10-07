import { EngineAction } from '/imports/api/engine/action/EngineActions';
import applyTask from '/imports/api/engine/action/tasks/applyTask'
import TaskResult from '/imports/api/engine/action/tasks/TaskResult';
import { getSingleProperty } from '/imports/api/engine/loadCreatures';
import InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import saveInputChoices from './userInput/saveInputChoices';

/**
 * Apply an action
 * This is run once as a simulation on the client awaiting all the various inputs or step through
 * clicks from the user, then it is run as part of the runAction method, where it is expected to
 * complete instantly on the client, and sent to the server as a method call
 * @param action The action to apply
 * @param userInput The input provider
 * @param { Object } options
 */
export default async function applyAction(action: EngineAction, userInput: InputProvider, options?: {
  simulate?: boolean, stepThrough?: boolean,
}) {
  const { simulate, stepThrough } = options || {};
  if (!simulate && stepThrough) throw 'Cannot step through unless simulating';
  if (simulate && !userInput) throw 'Must provide a function to get user input when simulating';

  if (action._isSimulation || action._stepThrough) {
    console.error('_isSimulation and _stepThrough should not be set on the action, rather call\
    applyAction with the appropriate options');
  }

  // If we are simulating, save the user input choices
  if (simulate) {
    userInput = saveInputChoices(action, userInput);
  }

  action._stepThrough = stepThrough;
  action._isSimulation = simulate;
  action.taskCount = 0;

  await addAncestorsToScope(action);
  await applyTask(action, action.task, userInput);
  return action;
}

/**
 * Puts the property the action starts from, and its ancestors, in the
 * action's scope as `#type`, the nearest of each type, as the creature's
 * computation resolves them. The action's scope otherwise only holds the
 * properties it applies, so a spell read `#spellList.dc` and
 * `#spellList.attackRollBonus` as 0 when cast, though its sheet showed them.
 * A spell cast with a slot (castSpell) is not applied through applyTask
 * either, so its own `#spell` comes from here too
 */
async function addAncestorsToScope(action: EngineAction) {
  const prop = 'prop' in action.task ? action.task.prop : undefined;
  if (!prop?._id) return;
  const result = new TaskResult(action.task.targetIds);
  result.scope[`#${prop.type}`] = { _propId: prop._id };
  let parentId = prop.parentId;
  // Up to the creature, which is not a property; the bound only stops a
  // corrupt tree that loops
  for (let depth = 0; parentId && depth < 100; depth += 1) {
    const ancestor = await getSingleProperty(action.creatureId, parentId);
    if (!ancestor) break;
    result.scope[`#${ancestor.type}`] ??= { _propId: ancestor._id };
    parentId = ancestor.parentId;
  }
  action.results.push(result);
}
