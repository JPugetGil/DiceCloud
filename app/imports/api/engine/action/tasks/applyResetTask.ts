import { EngineAction } from '/imports/api/engine/action/EngineActions';
import InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import { ResetTask, TurnEventTask } from '/imports/api/engine/action/tasks/Task';
import TaskResult, { LogContent } from '/imports/api/engine/action/tasks/TaskResult';
import applyTask from '/imports/api/engine/action/tasks/applyTask';
import { getCreature, getPropertiesByFilter } from '/imports/api/engine/loadCreatures';
import type { CreaturePropertyTypes } from '/imports/api/creature/creatureProperties/CreatureProperties';
import { buffDurationRounds } from '/imports/api/creature/creatureFolders/buffDurations';
import getPropertyTitle from '/imports/api/utility/getPropertyTitle';
import numberToSignedString from '/imports/api/utility/numberToSignedString';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { logLine, msg, type LogPart } from '/imports/api/creature/log/logMessages';

/*
 * The tasks of the events that happen to a creature as a whole: a rest
 * (reset), and its turn starting or ending in an initiative tracker
 * (turnEvent). Each resets what resets on its event, and fires the
 * creature's triggers of that event (applyEventTriggers). They share this
 * module: the engine's modules import one another through applyTask, and a
 * module of their own would add imports to that cycle (tests/cycles).
 */

// A rest's title, a message key (logs.shortRest)
const REST_TITLES: Record<string, string> = {
  shortRest: 'logs.shortRest',
  longRest: 'logs.longRest',
};

// The trigger events a rest fires: its own, and "Short or long rest"
const REST_TRIGGER_EVENTS: Record<string, string[]> = {
  shortRest: ['shortRest', 'anyRest'],
  longRest: ['longRest', 'anyRest'],
};

// The rest's entry of `table`: the event's name is the client's, never one of
// an object's own keys ("constructor")
const ofRest = <T>(table: Record<string, T>, eventName: string): T | undefined => (
  Object.prototype.hasOwnProperty.call(table, eventName) ? table[eventName] : undefined
);

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
  const restTitle = ofRest(REST_TITLES, task.eventName);
  const restored: LogPart[] | undefined = restTitle ? [] : undefined;
  const title: LogContent = restTitle
    ? logLine({ name: msg(restTitle), ...task.silent && { silenced: true } })
    : {};
  if (restTitle) result.mutations.push({ targetIds: task.targetIds, contents: [title] });

  // A rest's triggers: those timed before it, then, once it restored
  // everything, the others
  const triggerEvents = ofRest(REST_TRIGGER_EVENTS, task.eventName);
  if (triggerEvents) {
    await applyEventTriggers(action, task.targetIds[0], triggerEvents, ['before'], userInput);
  }

  // Reset the properties by this event name
  await resetProperties(task, action, result, userInput, restored);

  // Reset hit dice on a long rest, starting with the highest dice
  if (task.eventName === 'longRest') {
    await resetHitDice(task, action, result, userInput, restored);
  }

  if (triggerEvents) {
    await applyEventTriggers(action, task.targetIds[0], triggerEvents, ['after', 'afterChildren'], userInput);
  }

  if (restored) {
    // The list of what was restored, or a sentence saying there was nothing
    const summary = logLine({
      value: restored.length
        ? restored.map(line => typeof line === 'string' ? `- ${line}` : msg('logs.listItem', { item: line }))
        : msg('logs.nothingRestored'),
    });
    title.value = summary.value;
    if (summary.i18n?.value) title.i18n = { ...title.i18n, value: summary.i18n.value };
  }
}

// The line of a rest's summary for an attribute it restored
function restoredAttributeLine(title: string, prop, increment: number) {
  return `${title} **${numberToSignedString(-increment)}** (${(prop.value || 0) - increment}/${prop.total || 0})`;
}

export async function resetProperties(
  task: Pick<ResetTask, 'eventName' | 'targetIds' | 'silent'>, action: EngineAction, result: TaskResult,
  userInput: InputProvider, restored?: LogPart[]
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
    // A loaded creature's cache keeps its removed properties
    if (prop.removed) return false;
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
    restored?.push(msg(uses === 1 ? 'logs.restoredUse' : 'logs.restoredUses', {
      name: prop.name, change: numberToSignedString(prop.usesUsed),
    }));
    result.mutations.push({
      targetIds: [creatureId],
      updates: [{
        propId: prop._id,
        type: prop.type,
        set: { usesUsed: 0 },
      }],
      contents: [logLine({
        name: prop.name,
        value: prop.usesUsed >= 0
          ? msg('logs.usesRestored', { count: prop.usesUsed })
          : msg('logs.usesRemoved', { count: -prop.usesUsed }),
        ...(task.silent || restored) && { silenced: true },
      })],
    });
  }
}

export type TriggerTiming = 'before' | 'after' | 'afterChildren';

/**
 * Fires the triggers of `creatureId` for events that happen to the creature
 * as a whole, a rest or its turn, rather than to one of its properties: the
 * computation links those to no property (computeTrigger), so they are looked
 * up here. Those of one of `events` whose timing is one of `timings` (after,
 * for a trigger without one), active and not removed, in the order of the
 * creature's tree. Each targets the creature, and fires only if its condition
 * holds as it applies (applyTriggerProperty).
 *
 * Only for the acting creature: a trigger's children are looked up among the
 * properties of the creature that acts (applyChildren)
 */
export async function applyEventTriggers(
  action: EngineAction, creatureId: string, events: string[], timings: TriggerTiming[], userInput: InputProvider,
) {
  if (creatureId !== action.creatureId) return;
  const triggers = await getPropertiesByFilter(
    creatureId,
    prop => prop.type === 'trigger' && events.includes(prop.event) && !prop.removed && !prop.inactive,
    { type: 'trigger', event: { $in: events }, inactive: { $ne: true } },
  ) as CreaturePropertyTypes['trigger'][];
  for (const trigger of triggers) {
    if (!timings.includes(trigger.timing || 'after')) continue;
    await applyTask(action, { prop: trigger, targetIds: [creatureId] }, userInput);
  }
}

/**
 * A creature's turn starts or ends in an initiative tracker (TurnEventTask):
 * 1. its triggers of the event timed before;
 * 2. at the start of its turn, its effects that last some rounds lose one,
 *    and those whose last round is spent end (unless the party does not count
 *    them: countDurations);
 * 3. its other triggers of the event;
 * 4. what resets on the event resets: attributes and uses, as on a rest,
 *    but silently: a reaction back at every turn is no news, and alone it
 *    makes no log entry (runTurnEvent), unlike a rest's summary.
 *
 * The triggers come before the resets, so that a trigger can read a flag the
 * event then resets ("regeneration blocked this turn"). Each step logs in
 * results of its own, in the order it ran. The task needs no input: the
 * server applies it with the decisions suggested (runTurnEvent)
 */
export async function applyTurnEventTask(
  task: TurnEventTask, action: EngineAction, result: TaskResult, userInput: InputProvider
): Promise<void> {
  const creatureId = task.targetIds[0];
  if (task.targetIds.length !== 1 || creatureId !== action.creatureId) {
    throw new Meteor.Error('wrong-number-of-targets', 'A turn event applies to the creature whose turn it is alone');
  }
  const events = [task.eventName];
  await applyEventTriggers(action, creatureId, events, ['before'], userInput);
  if (task.countDurations && task.eventName === 'turnStart') {
    await countDurationsDown(action, creatureId);
  }
  await applyEventTriggers(action, creatureId, events, ['after', 'afterChildren'], userInput);
  const resets = new TaskResult(task.targetIds);
  action.results.push(resets);
  await resetProperties({ ...task, silent: true }, action, resets, userInput);
}

/**
 * Each of the creature's active effects that lasts some rounds has one less,
 * and those whose last round is spent end, with what is under them: one
 * inside an effect that ends goes with it, whatever its own duration. Logged
 * (unless the effect is silent) when it ends
 */
async function countDurationsDown(action: EngineAction, creatureId: string) {
  const result = new TaskResult([creatureId]);
  action.results.push(result);
  const buffs = await getPropertiesByFilter(
    creatureId,
    prop => prop.type === 'buff' && !prop.removed && !prop.inactive,
    { type: 'buff', inactive: { $ne: true } },
  ) as CreaturePropertyTypes['buff'][];
  const ended: CreaturePropertyTypes['buff'][] = [];
  for (const buff of buffs) {
    if (ended.some(parent => parent.left < buff.left && parent.right > buff.right)) continue;
    const rounds = buffDurationRounds(buff);
    if (!rounds) continue;
    const spent = (buff.durationSpent || 0) + 1;
    if (spent >= rounds) {
      ended.push(buff);
      result.mutations.push({
        targetIds: [creatureId],
        removals: [{ propId: buff._id }],
        contents: [logLine({
          name: buff.name || msg('logs.effect'),
          value: msg('logs.effectEnded'),
          ...buff.silent && { silenced: true },
        })],
      });
    } else {
      result.mutations.push({
        targetIds: [creatureId],
        updates: [{ propId: buff._id, type: 'buff', set: { durationSpent: spent } }],
      });
    }
  }
}

async function resetHitDice(
  task: ResetTask, action: EngineAction, result: TaskResult, userInput: InputProvider, restored?: LogPart[]
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
