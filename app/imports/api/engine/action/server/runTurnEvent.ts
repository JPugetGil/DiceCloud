import { Random } from 'meteor/random';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import type { EngineAction } from '/imports/api/engine/action/EngineActions';
import applyAction from '/imports/api/engine/action/functions/applyAction';
import writeActionResults from '/imports/api/engine/action/functions/writeActionResults';
import getAutomaticInputProvider from '/imports/api/engine/action/functions/userInput/getAutomaticInputProvider';
import { getActionDiceRoller, getHiddenDiceRoller } from '/imports/api/engine/action/functions/userInput/server/actionDice';
import TaskResult from '/imports/api/engine/action/tasks/TaskResult';
import type { TurnEventName } from '/imports/api/engine/action/tasks/Task';
import { getCreature } from '/imports/api/engine/loadCreatures';
import { fitLineName, logLine, msg } from '/imports/api/creature/log/logMessages';

/*
 * A creature's turn starts or ends in a party's initiative tracker, on the
 * server alone (phase 3.1): its effects lose a round, its triggers of the
 * event fire, what resets on it resets (applyTurnEventTask). The tracker
 * decides whose turn and makes sure each happens once
 * (creatureFolders/server/turnEvents.ts).
 *
 * The turn also counts down the effects the party's other creatures hold
 * that are anchored on this creature's turns (phase 3.5): "until the end of
 * its next turn" on a character, from a monster's attack. Each of those
 * creatures gets a pass of its own, which counts those effects alone and
 * logs in its own log, as its own turn would (applyAnchoredDurations).
 *
 * The action stays in memory, never in the actions collection: inserting it
 * would remove the action its player has in progress on the creature
 * (insertAction removes the others), and no client ever reads or runs it.
 * Its dice come from a secret of its own. Nobody is asked anything: a choice
 * is left unmade, with a line that says so, and a roll's advantage and a
 * check's options are the suggested ones.
 */

/**
 * - `nothing`: the creature has nothing to do on this event, found by one
 *   query: no engine, no write, no log, no computation (most monsters);
 * - `unchanged`: the engine ran, and nothing changed nor was logged (a
 *   trigger whose condition did not hold): no write, no log, no computation;
 * - `silent`: changes, and no line to show (an effect losing a round, a
 *   resource back: resets are silent, applyTurnEventTask): written and
 *   computed, without a log entry, so nothing on Discord either;
 * - `logged`: written, computed, and one log entry, titled with the event:
 *   only for a trigger's line that is not silent, or an effect that ended.
 *   The entry keeps the silenced lines, hidden as in any entry.
 */
export type TurnEventOutcome = 'nothing' | 'unchanged' | 'silent' | 'logged';

/**
 * - `countDurations`: whether effects count down (the party's choice);
 * - `sourcesWithTurns`: the creatures with turns in the party's tracker, on
 *   whose turns the effects anchored on them count down
 *   (durationClockOf); none: every effect follows its holder's turns;
 * - `holderIds`: the party's creatures, whose effects anchored on this
 *   creature's turns its turn counts down; none: no other creature's.
 */
export type TurnEventOptions = {
  countDurations?: boolean,
  sourcesWithTurns?: string[],
  holderIds?: string[],
};

// The log entry's title
const TITLES: Record<TurnEventName, string> = {
  turnStart: 'logs.turnStart',
  turnEnd: 'logs.turnEnd',
};

// The title of a holder's entry for another creature's turn: "End of Goblin 1's turn"
const ANCHORED_TITLES: Record<TurnEventName, string> = {
  turnStart: 'logs.turnStartOf',
  turnEnd: 'logs.turnEndOf',
};

/**
 * The effects this event of a turn counts down, as countDurationsDown selects
 * them: at a turn start, those counted at the start of the turns, and those
 * counted at their end that have not started counting yet; at a turn end,
 * those counted at the end that have
 */
function durationsCounted(eventName: TurnEventName): Record<string, unknown> {
  return eventName === 'turnStart'
    ? { $or: [{ durationEvent: { $ne: 'turnEnd' } }, { durationSpent: null }] }
    : { durationEvent: 'turnEnd', durationSpent: { $ne: null } };
}

// An effect that lasts some rounds, maybe
const timedBuff = { type: 'buff', inactive: { $ne: true }, duration: { $exists: true } };

/**
 * The creature's own work on the event: a trigger of the event, something
 * that resets on it and needs to, or an effect it counts down. Not an effect
 * anchored on another creature with turns in the tracker, whose turns count
 * it
 */
function ownWork(
  creatureId: string, eventName: TurnEventName, { countDurations = true, sourcesWithTurns = [] }: TurnEventOptions,
): Record<string, unknown> {
  const work: Record<string, unknown>[] = [
    { type: 'trigger', event: eventName, inactive: { $ne: true } },
    { type: 'attribute', reset: eventName, damage: { $nin: [0, null] } },
    { type: { $in: ['action', 'spell'] }, reset: eventName, usesUsed: { $nin: [0, null] } },
  ];
  if (countDurations) {
    const others = sourcesWithTurns.filter(id => id !== creatureId);
    work.push({
      ...timedBuff,
      $and: [
        durationsCounted(eventName),
        ...others.length ? [{ $or: [{ durationAnchor: { $ne: 'source' } }, { 'appliedBy.id': { $nin: others } }] }] : [],
      ],
    });
  }
  return { 'root.id': creatureId, $or: work };
}

/**
 * The effects the party's other creatures (`holderIds`) hold that are
 * anchored on this creature's turns and that this event counts down, by the
 * index on `appliedBy.id`. None when effects do not count down
 */
function anchoredWork(
  creatureId: string, eventName: TurnEventName, { countDurations = true, holderIds = [] }: TurnEventOptions,
): Record<string, unknown> | undefined {
  const holders = holderIds.filter(id => id !== creatureId);
  if (!countDurations || !holders.length) return undefined;
  return {
    ...timedBuff,
    'appliedBy.id': creatureId,
    durationAnchor: 'source',
    'root.id': { $in: holders },
    ...durationsCounted(eventName),
  };
}

/**
 * The properties that give the creature something to do on this event: its
 * own work (ownWork), and the effects of the party's other creatures
 * anchored on its turns (anchoredWork). Each branch reads an index: `root.id`,
 * `appliedBy.id`
 */
export function turnEventWorkSelector(
  creatureId: string, eventName: TurnEventName, options: TurnEventOptions = {},
): Record<string, unknown> {
  const own = ownWork(creatureId, eventName, options);
  const anchored = anchoredWork(creatureId, eventName, options);
  return { removed: { $ne: true }, ...anchored ? { $or: [own, anchored] } : own };
}

/**
 * Whether the creature may have something to do on this event, in one
 * query: a trigger of the event, something that resets on it and needs to,
 * an effect this event counts down; or one the party's other creatures hold
 * that is anchored on its turns. As the engine selects them
 * (applyTurnEventTask)
 */
export async function hasTurnEventWork(
  creatureId: string, eventName: TurnEventName, options: TurnEventOptions = {},
): Promise<boolean> {
  return !!await CreatureProperties.findOneAsync(
    turnEventWorkSelector(creatureId, eventName, options) as any,
    { fields: { _id: 1 } },
  );
}

/**
 * The party's creatures holding effects anchored on this creature's turns
 * that this event counts down
 */
export async function anchoredHolders(
  creatureId: string, eventName: TurnEventName, options: TurnEventOptions = {},
): Promise<string[]> {
  const anchored = anchoredWork(creatureId, eventName, options);
  if (!anchored) return [];
  const holders = await CreatureProperties.rawCollection().distinct('root.id', { removed: { $ne: true }, ...anchored } as any);
  return holders.sort();
}

const changes = (action: EngineAction) => action.results.some(result => result.mutations.some(
  mutation => mutation.updates?.length || mutation.inserts?.length || mutation.removals?.length,
));

const shownLines = (action: EngineAction) => action.results.some(result => result.mutations.some(
  mutation => mutation.contents?.some(line => !line.silenced),
));

/**
 * The creature's turn starts or ends: unless it has nothing to do
 * (hasTurnEventWork), applies the event (applyTurnEvents). Server only
 */
export default async function runTurnEvent(
  creatureId: string, eventName: TurnEventName, options: TurnEventOptions = {},
): Promise<TurnEventOutcome> {
  if (!await hasTurnEventWork(creatureId, eventName, options)) return 'nothing';
  return applyTurnEvents(creatureId, eventName, options);
}

/**
 * The creature's turn starts or ends, once it is known to have something to
 * do (hasTurnEventWork): the event applies to it, if it has work of its own
 * (applyTurnEvent), then the effects of the party's other creatures anchored
 * on its turns count down (applyAnchoredDurations). The outcome of its own.
 * Server only
 */
export async function applyTurnEvents(
  creatureId: string, eventName: TurnEventName, options: TurnEventOptions = {},
): Promise<TurnEventOutcome> {
  const anchored = anchoredWork(creatureId, eventName, options);
  // Without others' effects to count, the work found was its own
  const own = !anchored || await hasTurnEventWork(creatureId, eventName, { ...options, holderIds: undefined });
  const outcome = own ? await applyTurnEvent(creatureId, eventName, options) : 'nothing';
  if (anchored) await applyAnchoredDurations(creatureId, eventName, options);
  return outcome;
}

/**
 * The effects of the party's other creatures anchored on this creature's
 * turns count down: for each creature that holds some, a pass of its own,
 * which logs in its own log what ended, under "End of <creature>'s turn".
 * The outcome of each. Server only
 */
export async function applyAnchoredDurations(
  creatureId: string, eventName: TurnEventName, options: TurnEventOptions = {},
): Promise<Map<string, TurnEventOutcome>> {
  const outcomes = new Map<string, TurnEventOutcome>();
  // Its turn comes: it has turns, whatever the caller knew of the tracker
  const sourcesWithTurns = [...new Set([...options.sourcesWithTurns || [], creatureId])];
  for (const holderId of await anchoredHolders(creatureId, eventName, options)) {
    try {
      outcomes.set(holderId, await applyTurnEvent(holderId, eventName, { ...options, sourcesWithTurns, anchoredOn: creatureId }));
    } catch (error) {
      // The others' effects still count down
      console.error(error);
    }
  }
  return outcomes;
}

/**
 * Applies the event to the creature, writes what it did, and logs it on the
 * creature under the event's title when it did something to show. With
 * `anchoredOn`, the turn is that creature's: only the effects anchored on its
 * turns count down, and the title names it. Server only
 */
export async function applyTurnEvent(
  creatureId: string, eventName: TurnEventName,
  { countDurations = true, sourcesWithTurns, anchoredOn }: TurnEventOptions & { anchoredOn?: string } = {},
): Promise<Exclude<TurnEventOutcome, 'nothing'>> {
  const action: EngineAction = {
    _id: Random.id(),
    creatureId,
    task: {
      subtaskFn: 'turnEvent', eventName, targetIds: [creatureId], countDurations,
      ...sourcesWithTurns && { sourcesWithTurns },
      ...anchoredOn && { anchoredOn },
    },
    results: [],
    taskCount: 0,
  };
  const dice = { _id: action._id, seed: Random.secret() };
  await applyAction(action, getAutomaticInputProvider(action, getActionDiceRoller(dice), getHiddenDiceRoller(dice)));
  const shown = shownLines(action);
  if (!shown && !changes(action)) return 'unchanged';
  if (shown) {
    const title = new TaskResult([creatureId]);
    const name = anchoredOn
      ? msg(ANCHORED_TITLES[eventName], { name: (await getCreature(anchoredOn))?.name || '?' })
      : msg(TITLES[eventName]);
    const line = logLine({ name, silenced: false });
    title.appendLog({ ...line, name: fitLineName(line.name ?? '') }, [creatureId]);
    action.results.unshift(title);
  }
  await writeActionResults(action, { log: shown });
  return shown ? 'logged' : 'silent';
}
