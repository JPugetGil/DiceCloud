import { EngineAction } from '/imports/api/engine/action/EngineActions';
import InputProvider, { Advantage } from '/imports/api/engine/action/functions/userInput/InputProvider';
import type { Decision, DecisionKind } from '/imports/api/engine/action/functions/userInput/saveInputChoices';
import { leaveChoiceUnmade } from '/imports/api/engine/action/functions/userInput/getAutomaticInputProvider';

/**
 * Replays the user's decisions, each kind in the order it was made: the
 * choices, the advantages of rolls and the options of checks each from a
 * queue of its own (phase 2.3 of the monsters). The server's run of an action
 * may take another path than the browser's simulation, which leaves to the
 * server what a target hidden from the actor's readers does (a hit, a saving
 * throw): a path that rolls more or fewer dice, or asks one more question,
 * no longer shifts the decisions that follow. A queue that runs out gives the
 * suggested advantage and check options, and leaves a choice unmade, with a
 * line that says so (as getAutomaticInputProvider does).
 *
 * The dice are never the decisions': `actionDice` rolls them again, the
 * action's dice from the first (getActionDiceRoller), which the server gave
 * the client one roll at a time while the user played the action (drawDice).
 * No cheating. `rollHiddenDice`, the server's alone, rolls those of a hidden
 * target (getHiddenDiceRoller).
 *
 * `replayDice` is only for the client's simulation of runAction (a method
 * stub), which has no seed: it shows the dice the server drew, until the
 * server's own results replace them. The server never sets it.
 */
export default function getReplayChoicesInputProvider(
  action: EngineAction,
  actionDice: InputProvider['rollDice'],
  decisions: Decision[],
  { replayDice = false, rollHiddenDice }: {
    replayDice?: boolean, rollHiddenDice?: InputProvider['rollHiddenDice'],
  } = {},
): InputProvider {
  const queues = new Map<DecisionKind, unknown[]>();
  for (const { kind, value } of decisions) {
    if (!queues.has(kind)) queues.set(kind, []);
    queues.get(kind)!.push(value);
  }
  const next = (kind: DecisionKind) => queues.get(kind)?.shift();
  const isAdvantage = (value: unknown): value is Advantage => value === 0 || value === 1 || value === -1;
  return {
    nextStep() {
      return Promise.resolve();
    },
    // To roll dice, ignore the user and roll the action's dice again
    rollDice(dice) {
      const decided = replayDice ? next('rollDice') : undefined;
      if (Array.isArray(decided)) return Promise.resolve(decided);
      return actionDice(dice);
    },
    ...rollHiddenDice && { rollHiddenDice },
    async choose(choices) {
      const chosen = next('choose');
      if (Array.isArray(chosen)) return chosen.filter((id): id is string => typeof id === 'string');
      return leaveChoiceUnmade(action, choices);
    },
    async advantage(suggested) {
      const decided = next('advantage');
      return isAdvantage(decided) ? decided : suggested;
    },
    async check(suggested) {
      const decided = next('check');
      return decided && typeof decided === 'object' ? decided as typeof suggested : suggested;
    },
  };
}
