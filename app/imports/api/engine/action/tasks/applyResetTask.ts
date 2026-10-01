import { EngineAction } from '/imports/api/engine/action/EngineActions';
import InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import { ResetTask } from '/imports/api/engine/action/tasks/Task';
import TaskResult, { LogContent } from '/imports/api/engine/action/tasks/TaskResult';
import applyTask from '/imports/api/engine/action/tasks/applyTask';
import { getCreature, getPropertiesByFilter } from '/imports/api/engine/loadCreatures';
import type { CreaturePropertyTypes } from '/imports/api/creature/creatureProperties/CreatureProperties';
import getPropertyTitle from '/imports/api/utility/getPropertyTitle';
import numberToSignedString from '/imports/api/utility/numberToSignedString';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';

const REST_TITLES: Record<string, string> = {
  shortRest: 'Short Rest',
  longRest: 'Long Rest',
};

export default async function applyResetTask(
  task: ResetTask, action: EngineAction, result: TaskResult, userInput: InputProvider
): Promise<void> {
  // Event name must be defined
  if (!task.eventName) return;

  // This task can only be applied to a single target
  if (task.targetIds.length !== 1) {
    throw new Meteor.Error('wrong-number-of-targets', `Must reset the properties of a single creature at a time, ${task.targetIds.length} targets were provided`)
  }

  // A rest lists what it restored under its title, which comes first, and
  // logs each change silenced; other events log each change
  const restTitle = REST_TITLES[task.eventName];
  const restored: string[] | undefined = restTitle ? [] : undefined;
  const title: LogContent = { name: restTitle, ...task.silent && { silenced: true } };
  if (restTitle) result.mutations.push({ targetIds: task.targetIds, contents: [title] });

  // Reset the properties by this event name
  await resetProperties(task, action, result, userInput, restored);

  // Reset hit dice on a long rest, starting with the highest dice
  if (task.eventName === 'longRest') {
    await resetHitDice(task, action, result, userInput, restored);
  }

  if (restored) {
    title.value = restored.length ? restored.map(line => `- ${line}`).join('\n') : 'Nothing to restore';
  }
}

// The line of a rest's summary for an attribute it restored
function restoredAttributeLine(title: string, prop, increment: number) {
  return `${title} **${numberToSignedString(-increment)}** (${(prop.value || 0) - increment}/${prop.total || 0})`;
}

export async function resetProperties(
  task: ResetTask, action: EngineAction, result: TaskResult, userInput: InputProvider, restored?: string[]
) {
  const creatureId = task.targetIds[0];

  // Long rests reset short rest properties as well
  let mongoFilter: Mongo.Selector<object>
  if (task.eventName === 'longRest') {
    mongoFilter = { reset: { $in: ['shortRest', 'longRest'] } }
  } else {
    mongoFilter = { reset: task.eventName };
  }

  const filterFn = (prop) => {
    if (task.eventName === 'longRest') {
      if (prop.reset !== 'longRest' && prop.reset !== 'shortRest') return false;
    } else {
      if (prop.reset !== task.eventName) return false;
    }
    return true;
  }

  // Attributes

  const attributeFilter: Mongo.Selector<object> = {
    ...mongoFilter,
    type: 'attribute',
    damage: { $nin: [0, undefined] },
  }

  const attributeFilterFunction = (att) => {
    if (att.type !== 'attribute') return false;
    if (!filterFn(att)) return false;
    if (att.damage === 0 || att.damage === undefined) return false;
    return true;
  }

  const attributes = await getPropertiesByFilter(creatureId, attributeFilterFunction, attributeFilter);

  for (const prop of attributes) {
    const title = getPropertyTitle(prop);
    const increment = await applyTask(action, {
      targetIds: [action.creatureId],
      subtaskFn: 'damageProp',
      ...(task.silent || restored) && { silent: true },
      params: {
        title,
        operation: 'increment',
        value: -prop.damage || 0,
        targetProp: prop,
      },
    }, userInput);
    // A utility attribute is never shown
    if (increment && prop.attributeType !== 'utility') {
      restored?.push(restoredAttributeLine(title, prop, increment));
    }
  }

  // Action-like properties

  const actionFilter = {
    ...mongoFilter,
    type: {
      $in: ['action', 'spell']
    },
    usesUsed: { $nin: [0, undefined] },
  };

  const actionFilterFunction = (prop) => {
    if (prop.type !== 'action' && prop.type !== 'spell') return false;
    if (!filterFn(prop)) return false;
    if (prop.usesUsed === 0 || prop.usesUsed === undefined) return false;
    return true;
  }

  const actionProps = await getPropertiesByFilter(creatureId, actionFilterFunction, actionFilter);

  for (const prop of actionProps) {
    const uses = Math.abs(prop.usesUsed);
    restored?.push(`${prop.name} **${numberToSignedString(prop.usesUsed)}** ${uses === 1 ? 'use' : 'uses'}`);
    result.mutations.push({
      targetIds: [creatureId],
      updates: [{
        propId: prop._id,
        type: prop.type,
        set: { usesUsed: 0 },
      }],
      contents: [{
        name: prop.name,
        value: prop.usesUsed >= 0 ? `Restored ${prop.usesUsed} uses` : `Removed ${-prop.usesUsed} uses`,
        ...(task.silent || restored) && { silenced: true },
      }],
    });
  }
}

async function resetHitDice(
  task: ResetTask, action: EngineAction, result: TaskResult, userInput: InputProvider, restored?: string[]
) {
  const creatureId = task.targetIds[0];

  // Hit dice are attributes: there is no property of type hitDice
  const hitDice = await getPropertiesByFilter(
    creatureId,
    prop => prop.type === 'attribute' && prop.attributeType === 'hitDice' && !prop.removed && !prop.inactive,
    { type: 'attribute', attributeType: 'hitDice', inactive: { $ne: true } },
  ) as CreaturePropertyTypes['attribute'][];

  // Use a collator to do sorting in natural order
  const collator = new Intl.Collator('en', {
    numeric: true, sensitivity: 'base'
  });

  // Get the hit dice in decending order of hitDiceSize
  const compare = (a, b) => collator.compare(b.hitDiceSize, a.hitDiceSize)
  hitDice.sort(compare);

  // Get the total number of hit dice that can be recovered this rest
  const totalHd = hitDice.reduce((sum, hd) => sum + (hd.total || 0), 0);
  const creature = await getCreature(creatureId);
  const resetMultiplier = creature.settings.hitDiceResetMultiplier || 0.5;
  let recoverableHd = Math.max(Math.floor(totalHd * resetMultiplier), 1);

  // recover each hit dice in turn until the recoverable amount is used up,
  // passing over the sizes that have none spent
  let amountToRecover;
  for (const hd of hitDice) {
    if (!recoverableHd) break;
    amountToRecover = Math.min(recoverableHd, hd.damage ?? 0);
    if (!amountToRecover) continue;
    recoverableHd -= amountToRecover;

    // Apply the damage prop task
    const title = getPropertyTitle(hd);
    const increment = await applyTask(action, {
      targetIds: [creatureId],
      subtaskFn: 'damageProp',
      ...(task.silent || restored) && { silent: true },
      params: {
        title,
        operation: 'increment',
        value: -amountToRecover,
        targetProp: hd,
      },
    }, userInput);
    if (increment) {
      const size = hd.hitDiceSize && !title.includes(hd.hitDiceSize) ? ` ${hd.hitDiceSize}` : '';
      restored?.push(restoredAttributeLine(`${title}${size}`, hd, increment));
    }

  }
}
