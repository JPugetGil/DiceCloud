import { Random } from 'meteor/random';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { EngineAction } from '/imports/api/engine/action/EngineActions';
import applyAction from '/imports/api/engine/action/functions/applyAction';
import writeActionResults from '/imports/api/engine/action/functions/writeActionResults';
import getAutomaticInputProvider from '/imports/api/engine/action/functions/userInput/getAutomaticInputProvider';
import { getActionDiceRoller, getHiddenDiceRoller } from '/imports/api/engine/action/functions/userInput/server/actionDice';
import TaskResult from '/imports/api/engine/action/tasks/TaskResult';
import type { TurnEventName } from '/imports/api/engine/action/tasks/Task';
import { logLine, msg } from '/imports/api/creature/log/logMessages';

/*
 * A creature's turn starts or ends in a party's initiative tracker, on the
 * server alone (phase 3.1): its effects lose a round, its triggers of the
 * event fire, what resets on it resets (applyTurnEventTask). The tracker
 * decides whose turn and makes sure each happens once
 * (creatureFolders/server/turnEvents.ts).
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

// The log entry's title
const TITLES: Record<TurnEventName, string> = {
  turnStart: 'logs.turnStart',
  turnEnd: 'logs.turnEnd',
};

/**
 * Whether the creature may have something to do on this event, in one
 * query: a trigger of the event, something that resets on it and needs to,
 * or, at the start of its turn when durations count, an effect with a
 * duration. As the engine selects them (applyTurnEventTask)
 */
export async function hasTurnEventWork(
  creatureId: string, eventName: TurnEventName, { countDurations = true } = {},
): Promise<boolean> {
  const work: Record<string, unknown>[] = [
    { type: 'trigger', event: eventName, inactive: { $ne: true } },
    { type: 'attribute', reset: eventName, damage: { $nin: [0, null] } },
    { type: { $in: ['action', 'spell'] }, reset: eventName, usesUsed: { $nin: [0, null] } },
  ];
  if (countDurations && eventName === 'turnStart') {
    work.push({ type: 'buff', inactive: { $ne: true }, duration: { $exists: true } });
  }
  return !!await CreatureProperties.findOneAsync(
    { 'root.id': creatureId, removed: { $ne: true }, $or: work } as any,
    { fields: { _id: 1 } },
  );
}

const changes = (action: EngineAction) => action.results.some(result => result.mutations.some(
  mutation => mutation.updates?.length || mutation.inserts?.length || mutation.removals?.length,
));

const shownLines = (action: EngineAction) => action.results.some(result => result.mutations.some(
  mutation => mutation.contents?.some(line => !line.silenced),
));

/**
 * The creature's turn starts or ends: unless it has nothing to do
 * (hasTurnEventWork), applies the event (applyTurnEvent). Server only
 */
export default async function runTurnEvent(
  creatureId: string, eventName: TurnEventName, { countDurations = true } = {},
): Promise<TurnEventOutcome> {
  if (!await hasTurnEventWork(creatureId, eventName, { countDurations })) return 'nothing';
  return applyTurnEvent(creatureId, eventName, { countDurations });
}

/**
 * Applies the event to the creature, writes what it did, and logs it on the
 * creature under the event's title when it did something to show. Server only
 */
export async function applyTurnEvent(
  creatureId: string, eventName: TurnEventName, { countDurations = true } = {},
): Promise<Exclude<TurnEventOutcome, 'nothing'>> {
  const action: EngineAction = {
    _id: Random.id(),
    creatureId,
    task: { subtaskFn: 'turnEvent', eventName, targetIds: [creatureId], countDurations },
    results: [],
    taskCount: 0,
  };
  const dice = { _id: action._id, seed: Random.secret() };
  await applyAction(action, getAutomaticInputProvider(action, getActionDiceRoller(dice), getHiddenDiceRoller(dice)));
  const shown = shownLines(action);
  if (!shown && !changes(action)) return 'unchanged';
  if (shown) {
    const title = new TaskResult([creatureId]);
    title.appendLog(logLine({ name: msg(TITLES[eventName]), silenced: false }), [creatureId]);
    action.results.unshift(title);
  }
  await writeActionResults(action, { log: shown });
  return shown ? 'logged' : 'silent';
}
