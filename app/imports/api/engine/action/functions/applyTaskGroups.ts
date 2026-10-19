import { get } from 'lodash';

import { getPropertyChildren, getSingleProperty } from '/imports/api/engine/loadCreatures';
import type { EngineAction } from '/imports/api/engine/action/EngineActions';
import applyTask from '../tasks/applyTask';
import type { PropTask } from '../tasks/Task';
import type InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import type { CreatureProperty } from '/imports/api/creature/creatureProperties/CreatureProperties';

/**
 * Get all the child tasks of a given property
 * @param action
 * @param prop 
 * @param targetIds 
 * @returns 
 */
export async function applyChildren(
  action: EngineAction, prop, targetIds: string[], inputProvider: InputProvider
) {
  const children = await getPropertyChildren(action.creatureId, prop);
  for (const childProp of children) {
    await applyTask(action, { prop: childProp, targetIds }, inputProvider);
  }
}

/**
 * Get the afterChildren triggers for a given property
 * @param prop 
 * @param targetIds 
 * @returns 
 */
export async function applyAfterChildrenTriggers(
  action: EngineAction, prop, targetIds: string[], inputProvider: InputProvider
) {
  if (!prop.triggerIds?.afterChildren) return;
  for (const triggerId of prop.triggerIds.afterChildren) {
    const trigger = await getSingleProperty(action.creatureId, triggerId);
    if (!trigger) continue;
    await applyTask(action, { prop: trigger, targetIds }, inputProvider);
  }
}

export async function applyAfterTriggers(
  action: EngineAction, prop, targetIds: string[], inputProvider: InputProvider
) {
  if (!prop.triggerIds?.after) return;
  for (const triggerId of prop.triggerIds.after) {
    const trigger = await getSingleProperty(action.creatureId, triggerId);
    if (!trigger) continue;
    await applyTask(action, { prop: trigger, targetIds }, inputProvider);
  }
}

/**
 * Applies the following:
 * After triggers
 * Children of the prop
 * After-children triggers
 * @param action 
 * @param prop 
 * @param targetIds 
 * @returns 
 */
export async function applyDefaultAfterPropTasks(
  action: EngineAction, prop, targetIds: string[], inputProvider: InputProvider
) {
  await applyAfterTriggers(action, prop, targetIds, inputProvider);
  await applyChildren(action, prop, targetIds, inputProvider);
  await applyAfterChildrenTriggers(action, prop, targetIds, inputProvider);
}

/**
 * Applies the following:
 * After triggers
 * After-children triggers
 * @param action 
 * @param prop 
 * @param targetIds 
 * @returns 
 */
export async function applyAfterTasksSkipChildren(
  action: EngineAction, prop, targetIds: string[], inputProvider: InputProvider
) {
  await applyAfterTriggers(action, prop, targetIds, inputProvider);
  await applyAfterChildrenTriggers(action, prop, targetIds, inputProvider);
}

/**
 * Returns a list of tasks containing the following:
 * After triggers
 * After-children triggers
 * @param action 
 * @param prop 
 * @param targetIds 
 * @returns 
 */
export async function applyAfterPropTasksForSingleChild(
  action: EngineAction, prop, childProp, targetIds: string[], inputProvider: InputProvider
) {
  await applyAfterTriggers(action, prop, targetIds, inputProvider);
  await applyTask(action, { prop: childProp, targetIds }, inputProvider);
  await applyAfterChildrenTriggers(action, prop, targetIds, inputProvider);
}

/**
 * Returns a list of tasks containing the following:
 * After triggers
 * After-children triggers
 * @param action 
 * @param prop 
 * @param targetIds 
 * @returns 
 */
export async function applyAfterPropTasksForSomeChildren(
  action: EngineAction, prop, children, targetIds: string[], inputProvider: InputProvider
) {
  await applyAfterTriggers(action, prop, targetIds, inputProvider);
  for (const childProp of children) {
    await applyTask(action, { prop: childProp, targetIds }, inputProvider);
  }
  await applyAfterChildrenTriggers(action, prop, targetIds, inputProvider);
}

/**
 * Get all the trigger tasks for a given trigger path
 * @param action 
 * @param prop 
 * @param targetIds 
 * @param triggerPath 
 * @returns 
 */
export async function applyTriggers(
  action: EngineAction, prop, targetIds: string[], triggerPath: string, inputProvider: InputProvider
) {
  const triggerIds = get(prop, triggerPath);
  if (!triggerIds) return;
  for (const triggerId of triggerIds) {
    const trigger = await getSingleProperty(action.creatureId, triggerId);
    if (!trigger) continue;
    await applyTask(action, { prop: trigger, targetIds }, inputProvider);
  }
}

/**
 * Split a task over its targets, incrementing task step by 1
 * @param task 
 * @param targetIds 
 * @returns Copies of the task, but with a single target each
 */
export async function applyTaskToEachTarget(
  action: EngineAction, task: PropTask, targetIds: string[] = task.targetIds, inputProvider: InputProvider
) {
  if (targetIds.length <= 1) throw 'Must have multiple targets to split a task';
  // If there are targets, apply a new task to each target
  for (const targetId of targetIds) {
    await applyTask(action, {
      ...task,
      targetIds: [targetId]
    }, inputProvider);
  }
}

/**
 * Spends `amount` of one of a creature's attributes, as damageProp does it
 * (within the attribute's limits, with its damage triggers, a line in its
 * own log): a resource the target spends as a property applies to it, its
 * legendary resistance (applySavingThrowProperty). Here, with the tasks it
 * applies: the properties import this module already, and an import of
 * applyTask from one of them would close another cycle (tests/cycles).
 * Resolves to what it spent
 */
export async function spendAttribute(
  action: EngineAction, creatureId: string, attribute: CreatureProperty,
  amount: number, inputProvider: InputProvider, { silent = false }: { silent?: boolean } = {},
): Promise<number> {
  return applyTask(action, {
    targetIds: [creatureId],
    subtaskFn: 'damageProp',
    ...silent && { silent: true },
    params: { operation: 'increment', value: amount, targetProp: attribute },
  }, inputProvider);
}
