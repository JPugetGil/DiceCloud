import { check, Match } from 'meteor/check';
import { Meteor } from 'meteor/meteor';
import { getSingleProperty } from '/imports/api/engine/loadCreatures';
import { hasAncestorRelationship } from '/imports/api/parenting/parentingFunctions';
import { MAX_INITIATIVE_ENTRIES } from '/imports/api/creature/creatureFolders/initiativeOrder';
import type Task from '/imports/api/engine/action/tasks/Task';
import { englishMessage } from '/imports/api/creature/log/logMessages';

// The creatures a task may target: as many as a fight holds. The engine
// applies the task to each, and recomputes each, so a list without a bound
// held the server for as long as the client liked
export const MAX_TASK_TARGETS = MAX_INITIATIVE_ENTRIES;

/** A task's target ids: strings, at most MAX_TASK_TARGETS of them */
export const TargetIds = Match.Where(value => Array.isArray(value)
  && value.length <= MAX_TASK_TARGETS && value.every(id => typeof id === 'string'));

const FiniteNumber = Match.Where(value => typeof value === 'number' && Number.isFinite(value));
// Absent, undefined or null. In an object, Match.Maybe makes the key
// optional, but tests a value that is there against its pattern alone: a
// check's `dc: null` failed it
const maybe = (pattern: any) => Match.Optional(Match.Where(
  value => value === undefined || value === null || Match.test(value, pattern),
));
const OptionalString = maybe(String);

/**
 * The task the client sent to insertAction, as the server will apply it.
 *
 * Every property in it is read again from the database by its id: it must
 * belong to the creature it applies to and not be removed, and the client's
 * copy only names it. Otherwise a modified client could send its own version
 * of a property (an attack bonus, a damage roll, its uses) and have it
 * applied, or the id of another creature's property, which the action's
 * results would then write to (they update properties by id).
 *
 * The client sends no property without a document: its tasks hold the sheet's
 * own properties (doAction, the attribute and health bar buttons, the spell
 * slots, CastSpellWithSlotDialog). The properties built in memory, an
 * adjustment's `{ name }` target, and the ammunition and spell slot tasks are
 * made by the engine as it runs, on each side, from properties it read itself.
 * The task's other fields are what the user chose (the damage typed, a
 * check's options, the rest taken, the slot to cast with), which the engine
 * reads again where it matters (the slot): they are checked for their types.
 */
export default async function taskFromDatabase(task: Task, creatureId: string): Promise<Task> {
  check(task, Match.ObjectIncluding({
    targetIds: TargetIds,
    silent: maybe(Boolean),
  }));
  switch (task.subtaskFn) {
    case undefined: {
      const prop = await propertyOf(creatureId, task.prop);
      assertTargetCount(prop, task.targetIds);
      return { ...task, prop };
    }
    case 'castSpell': {
      check(task.params, {
        slotId: OptionalString,
        ritual: maybe(Boolean),
        withoutSpellSlot: maybe(Boolean),
      });
      const prop = await propertyOf(creatureId, task.prop);
      if (prop.type !== 'spell') {
        throw new Meteor.Error('validation-error', 'Only a spell can be cast');
      }
      assertTargetCount(prop, task.targetIds);
      return { ...task, prop };
    }
    case 'consumeItemAsAmmo': {
      check(task.params, Match.ObjectIncluding({ value: FiniteNumber }));
      const prop = await propertyOf(creatureId, task.prop);
      const item = await propertyOf(creatureId, task.params.item);
      return {
        ...task,
        prop,
        // As the engine sets it (spendResources): an item under the action, or
        // above it, would apply its children again and again
        params: { ...task.params, item, skipChildren: hasAncestorRelationship(item, prop) },
      };
    }
    case 'damageProp': {
      check(task.params, Match.ObjectIncluding({
        operation: Match.OneOf('increment', 'set'),
        value: FiniteNumber,
        title: OptionalString,
        targetProp: Object,
      }));
      const { targetProp } = task.params;
      // A property of the target, whose damage the task changes
      if ('_id' in targetProp && targetProp._id !== undefined) {
        const targetId = task.targetIds[0] ?? creatureId;
        return {
          ...task,
          params: { ...task.params, targetProp: await propertyOf(targetId, targetProp) },
        };
      }
      // Or only a name, which the engine looks for on the target: nothing else
      // of the client's object is kept
      const { name } = targetProp as { name: unknown };
      check(name, String);
      return { ...task, params: { ...task.params, targetProp: { name } } };
    }
    case 'dealDamage':
      check(task.params, { amount: FiniteNumber, damageType: OptionalString });
      return task;
    case 'check':
      check(task, Match.ObjectIncluding({
        advantage: maybe(Match.OneOf(-1, 0, 1)),
        skillVariableName: OptionalString,
        abilityVariableName: OptionalString,
        dc: maybe(FiniteNumber),
        contest: maybe(true),
        targetSkillVariableName: OptionalString,
        targetAbilityVariableName: OptionalString,
      }));
      return task;
    case 'reset':
      check(task.eventName, String);
      return task;
    // Never a client's: the server alone makes them, for the creatures of an
    // initiative tracker whose turn starts or ends (runTurnEvent), and for
    // the creatures an action changed, whose damage triggers then fire
    // (writeActionResults)
    case 'turnEvent':
    case 'receivedDamage':
    default:
      throw new Meteor.Error('validation-error', 'Unknown task');
  }
}

/**
 * An action or a spell for a single target takes one at most: the target
 * picker offers one (TargetPicker.vue), and the engine would apply it to all
 * it is given. In English, and in the reader's language through its details
 */
function assertTargetCount(prop: { target?: string }, targetIds: string[]) {
  if (prop.target !== 'singleTarget' || targetIds.length <= 1) return;
  const key = 'targetPicker.errors.singleTarget';
  // any: Meteor's types say details are a string; DDP sends any EJSON value
  throw new Meteor.Error('too-many-targets', englishMessage(key), { i18n: { key } } as any);
}

/**
 * The property the client's copy names, as the database holds it: one of the
 * creature's, not removed
 */
async function propertyOf(creatureId: string, clientCopy: unknown) {
  check(clientCopy, Match.ObjectIncluding({ _id: String }));
  const prop = await getSingleProperty(creatureId, (clientCopy as { _id: string })._id);
  if (!prop) throw new Meteor.Error('not-found', 'Property not found');
  return prop;
}
