import { EngineAction } from '/imports/api/engine/action/EngineActions';
import { DamagePropTask, ReceivedDamageTask } from '/imports/api/engine/action/tasks/Task';
import TaskResult from '/imports/api/engine/action/tasks/TaskResult';
import InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import { WHOLE } from '/imports/api/creature/log/logViews';
import { applyTriggers } from '/imports/api/engine/action/functions/applyTaskGroups';
import { getEffectiveActionScope } from '/imports/api/engine/action/functions/getEffectiveActionScope';
import getPropertyTitle from '/imports/api/utility/getPropertyTitle';
import { getSingleProperty } from '/imports/api/engine/loadCreatures';
import getEffectiveProperty from '/imports/api/engine/action/functions/getEffectiveProperty';
import numberToSignedString from '/imports/api/utility/numberToSignedString';
import { lowerCase, upperFirst } from 'lodash';
import { EJSON } from 'meteor/ejson';
import { Meteor } from 'meteor/meteor';
import { attributeTypeMessage, logLine, msg } from '/imports/api/creature/log/logMessages';
import { targetSight } from '/imports/api/engine/action/functions/hiddenStats';

export default async function applyDamagePropTask(
  task: DamagePropTask, action: EngineAction, result: TaskResult, userInput
): Promise<number> {
  if (task.targetIds.length > 1) {
    throw 'This subtask can only be called on a single target';
  }
  const targetId = task.targetIds[0];

  let { value } = task.params;
  const { title, operation, damageType } = task.params;
  let targetProp = task.params.targetProp;

  if (!targetProp) throw new Meteor.Error('not-found', 'Target property is required')

  // Set the scope properties
  result.pushScope = {};
  if (operation === 'increment') {
    if (value >= 0) {
      result.pushScope['~damage'] = { value };
    } else {
      result.pushScope['~healing'] = { value: -value };
    }
  } else {
    result.pushScope['~set'] = { value };
  }
  // The type of the damage that changes it, for its triggers: "takes fire
  // damage" (a troll's regeneration). The actor's own damage: its scope may
  // hold it, whoever the target is. Blank when no damage dealt it, rather
  // than an outer change's
  result.pushScope['~damageType'] = typeScope(damageType);
  // Store which property we're targeting. A target hidden from the actor's
  // readers: its id alone. The whole property, its total and what it has
  // left, stays in the actor's scope for the rest of the action, where any
  // formula would print a monster's hit points in the actor's log
  if (targetId === action.creatureId) {
    result.pushScope['~attributeDamaged'] = { _propId: targetProp._id };
  } else if (await targetSight(action, targetId, userInput) !== 'shown') {
    result.pushScope['~attributeDamaged'] = { _id: (targetProp as { _id?: string })._id };
  } else {
    result.pushScope['~attributeDamaged'] = targetProp;
  }

  // Run the before triggers which may change scope properties. Only the
  // acting creature's own: a trigger of another creature's is not one of its
  // properties (applyTriggers), and nothing runs a target's `before` damage
  // triggers on its behalf while the action changes the damage in flight
  // (two in the Vexus libraries, Voices from Beyond and Ominous Will). Its
  // `after` ones run once the action is written (ReceivedDamageTask)
  await applyTriggers(action, targetProp, [targetId], 'damageTriggerIds.before', userInput);

  // Create a new result after triggers have run
  result = new TaskResult(task.targetIds);
  action.results.push(result);

  // Refetch the scope properties
  const scope = await getEffectiveActionScope(action);
  result.popScope = {
    '~damage': 1, '~healing': 1, '~set': 1, '~attributeDamaged': 1, '~damageType': 1,
  };
  value = +value;
  if (operation === 'increment') {
    if (value >= 0) {
      value = scope['~damage']?.value;
    } else {
      value = -scope['~healing']?.value;
    }
  } else {
    value = scope['~set']?.value;
  }
  const targetPropId = scope['~attributeDamaged']?._propId ??
    scope['~attributeDamaged']?._id;

  // If there are no targets, just log the result that would apply and end
  if (!task.targetIds?.length) {
    // Get the locally equivalent stat with the same variable name
    const statName = getPropertyTitle(targetProp);
    result.appendLog(logLine({
      name: title,
      value: operation === 'set' ? msg('logs.attributeSetTo', { name: statName, value }) : `${statName} ${value}`,
      inline: true,
      silenced: task.silent ?? false,
    }), task.targetIds);
  }

  let damage, newValue, increment;
  targetProp = await getSingleProperty(targetId, targetPropId);

  if (!targetProp) return value;
  // Include the damage and healing this action has already dealt it
  targetProp = getEffectiveProperty(action, targetProp);

  if (operation === 'set') {
    const total = targetProp.total || 0;
    // Set represents what we want the value to be after damage
    // So we need the actual damage to get to that value
    damage = total - value;
    // Damage can't exceed total value
    if (damage > total && !targetProp.ignoreLowerLimit) damage = total;
    // Damage must be positive
    if (damage < 0 && !targetProp.ignoreUpperLimit) damage = 0;
    newValue = targetProp.total - damage;
    // Write the results
    result.mutations.push({
      targetIds: [targetId],
      updates: [{
        propId: targetProp._id,
        set: { damage, value: newValue },
        type: targetProp.type,
      }],
      // The target's own attribute: its players read the line whole
      contents: [{
        ...logLine({
          name: title,
          value: msg('logs.attributeSet', { name: getPropertyTitle(targetProp), from: targetProp.value, to: value }),
          inline: true,
          ...(task.silent || isHidden(targetProp)) && { silenced: true },
        }),
        targetView: WHOLE,
      }]
    });
    if (targetId === action.creatureId) setScope(result, targetProp, newValue, damage);
  } else if (operation === 'increment') {
    const currentValue = targetProp.value || 0;
    const currentDamage = targetProp.damage || 0;
    increment = value;
    // Can't increase damage above the remaining value
    if (increment > currentValue && !targetProp.ignoreLowerLimit) increment = currentValue;
    // Can't decrease damage below zero
    if (-increment > currentDamage && !targetProp.ignoreUpperLimit) increment = -currentDamage;
    // Only increment if the increment is non-zero
    if (increment !== 0) {
      damage = currentDamage + increment;
      newValue = targetProp.total - damage;
      const attributeType = attributeTypeMessage(
        targetProp.attributeType, upperFirst(lowerCase(targetProp.attributeType))
      );
      // Write the results
      result.mutations.push({
        targetIds: [targetId],
        updates: [{
          propId: targetProp._id,
          inc: { damage: increment, value: -increment },
          type: targetProp.type,
        }],
        contents: [{
          ...logLine({
            name: msg(increment >= 0 ? 'logs.attributeDamaged' : 'logs.attributeRestored', { type: attributeType }),
            value: `${numberToSignedString(-increment)} ${getPropertyTitle(targetProp)}`,
            inline: true,
            ...(task.silent || isHidden(targetProp)) && { silenced: true },
          }),
          targetView: WHOLE,
        }]
      });
      if (targetId === action.creatureId) setScope(result, targetProp, newValue, damage);
    }
  }
  if (targetId === action.creatureId) {
    await applyTriggers(action, targetProp, [targetId], 'damageTriggerIds.after', userInput);
    await applyTriggers(action, targetProp, [targetId], 'damageTriggerIds.afterChildren', userInput);
  } else if (damage !== undefined && hasAfterTriggers(targetProp)) {
    // Another creature's: its triggers are its own properties, which this
    // action does not apply. They fire on its behalf once the action is
    // written, with what it took (ReceivedDamageTask, writeActionResults)
    (action._receivedDamage ??= []).push({
      targetId, propId: targetProp._id, operation, value, ...damageType && { damageType },
    });
  }
  return increment;
}

// Whether the attribute has damage triggers that fire after it changes
const hasAfterTriggers = (prop: any) => !!(prop.damageTriggerIds?.after?.length
  || prop.damageTriggerIds?.afterChildren?.length);

// The damage's type, as the scope holds it: blank without one
const typeScope = (damageType?: string) => damageType ? { value: damageType } : {};

// What a change to an attribute puts in the scope of its triggers
function damageScope(operation: 'increment' | 'set', value: number, damageType?: string) {
  if (operation === 'set') return { '~set': { value }, '~damageType': typeScope() };
  const amount = value >= 0 ? { '~damage': { value } } : { '~healing': { value: -value } };
  return { ...amount, '~damageType': typeScope(damageType) };
}

/**
 * What another creature's action did to the attributes of a creature: its
 * own damage triggers then fire, on its behalf, as when it damages itself,
 * those timed after the change and after its children, with `~damage`,
 * `~healing` or `~set`, the damage's type `~damageType`, and
 * `~attributeDamaged`, in their scope. Its `before`
 * triggers do not: they would change the damage of an action already
 * written. The server alone makes this task, once the action is written
 * (writeActionResults); taskFromDatabase refuses it
 */
export async function applyReceivedDamageTask(
  task: ReceivedDamageTask, action: EngineAction, result: TaskResult, userInput: InputProvider,
): Promise<void> {
  const creatureId = task.targetIds[0];
  if (task.targetIds.length !== 1 || creatureId !== action.creatureId) {
    throw new Meteor.Error('wrong-number-of-targets', 'A creature\'s triggers fire on its own behalf alone');
  }
  for (const [index, change] of task.params.changes.entries()) {
    const prop = await getSingleProperty(creatureId, change.propId);
    if (!prop) continue;
    const step = index === 0 ? result : new TaskResult(task.targetIds);
    step.pushScope = {
      ...damageScope(change.operation, change.value, change.damageType), '~attributeDamaged': { _propId: prop._id },
    };
    if (step !== result) action.results.push(step);
    await applyTriggers(action, prop, [creatureId], 'damageTriggerIds.after', userInput);
    await applyTriggers(action, prop, [creatureId], 'damageTriggerIds.afterChildren', userInput);
    const done = new TaskResult(task.targetIds);
    done.popScope = { '~damage': 1, '~healing': 1, '~set': 1, '~attributeDamaged': 1, '~damageType': 1 };
    action.results.push(done);
  }
}

// A utility attribute is never displayed (a tutorial's progress, a counter):
// its changes are logged silenced, hidden unless the reader asks for them
function isHidden(targetProp) {
  return targetProp.attributeType === 'utility';
}

// Update the scope with the attribute, but updated to the new value, so later
// calculations in the action read it. The property itself is read through
// getEffectiveProperty, which applies the updates already in the results.
function setScope(result, targetProp, newValue, damage) {
  // This isn't the defining property, don't bother
  if (targetProp.overridden) return;
  const key = targetProp.variableName;
  // No variable name can't set scope
  if (!key) return;
  // Make sure scope is defined
  if (!result.scope) result.scope = {};
  result.scope[key] = {
    ...EJSON.clone(targetProp),
    value: newValue,
    damage,
  };
}
