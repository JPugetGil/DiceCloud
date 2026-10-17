import { EJSON } from 'meteor/ejson';
import { Meteor } from 'meteor/meteor';
import EngineActions, { type EngineAction } from '/imports/api/engine/action/EngineActions';
import applyAction from '/imports/api/engine/action/functions/applyAction';
import getReplayChoicesInputProvider from '/imports/api/engine/action/functions/userInput/getReplayChoicesInputProvider';
import { getActionDiceRoller } from '/imports/api/engine/action/functions/userInput/server/actionDice';
import { diceCount, type DiceRequest } from '/imports/api/engine/action/functions/userInput/getDeterministicDiceRoller';
import type InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import type { Advantage, CheckParams } from '/imports/api/engine/action/functions/userInput/InputProvider';
import type { Decision, DecisionKind } from '/imports/api/engine/action/functions/userInput/saveInputChoices';

/*
 * /action's dry run (D6): the action played on the server as the browser's
 * simulation plays it before it calls runAction (doAction, ActionDialog), to
 * find the first choice it asks that has no answer yet. Its dice come from
 * the action's seed, in the order it rolls them, as runAction will roll them;
 * the decisions made so far are replayed by kind, through runAction's own
 * replay (getReplayChoicesInputProvider); the first choice past them stops
 * it, as the browser's dialog stops at an input.
 *
 * A roll's advantage is never asked (decision of 17 October): the command's
 * `advantage` option, else what the sheet suggests (its conditions and
 * effects), is decided here, and those decisions are returned to be kept
 * with the others, so that runAction replays them. A check's options alike.
 *
 * It writes nothing. applyAction only reads (the creatures, their properties
 * and variables, through loadCreatures) and keeps what the action would do in
 * the action it is given: here a copy of the stored action, dropped once read.
 * Only writeActionResults writes, which runAction alone calls. Proven by
 * actionCommand.test.ts, which compares the database before and after.
 *
 * As the browser, it never resolves what a target hidden from the actor's
 * players does: no rollHiddenDice, so such a target is 'unresolved'
 * (hiddenStats.ts) and no branch applies on it. Its questions never depend on
 * a monster's stats; runAction, which does resolve it, leaves a question it
 * meets on such a branch unanswered, with a line that says so, as after the
 * browser.
 */

export type ReplayQuestion = { kind: 'choose', choices: { _id: string, name?: string, type?: string }[] };

/**
 * What the dry run found: its first unanswered choice, if any; how many of
 * the action's dice it rolled; the advantages (and check options) it decided
 * on its way, past the decisions it was given
 */
export type Replay = { question?: ReplayQuestion, dice: number, decided: Decision[] };

// What stops the run: thrown through the engine, caught here
const ASKED = 'discord-action-input-requested';

/**
 * The action played from its stored state with these decisions, up to its
 * first unanswered choice; its rolls with `advantage` when given, else as the
 * sheet suggests
 */
export async function dryRun(actionId: string, decisions: Decision[], { advantage }: { advantage?: Advantage } = {}): Promise<Replay> {
  const stored = await EngineActions.findOneAsync(actionId);
  if (!stored) throw new Meteor.Error('not-found', 'Action not found');
  // The engine changes the action it is given: a copy, from no results, as
  // runAction starts from
  const action: EngineAction = { ...EJSON.clone(stored), results: [] };
  const dice = { count: 0 };
  const actionDice = getActionDiceRoller({ _id: actionId, seed: stored.seed });
  const rollDice = (request: DiceRequest) => {
    dice.count += diceCount(request);
    return actionDice(request);
  };
  const replay = getReplayChoicesInputProvider(action, rollDice, decisions);
  // The answers left of each kind: past them, the question is the user's
  const left = new Map<DecisionKind, number>();
  for (const { kind } of decisions) left.set(kind, (left.get(kind) ?? 0) + 1);
  const answered = (kind: DecisionKind) => {
    const count = left.get(kind) ?? 0;
    if (count <= 0) return false;
    left.set(kind, count - 1);
    return true;
  };
  let question: ReplayQuestion | undefined;
  const ask = (asked: ReplayQuestion): never => {
    question = asked;
    throw ASKED;
  };
  // Decided here, never asked: the option's, else the sheet's suggestion
  const decided: Decision[] = [];
  const decide = <T>(kind: 'advantage' | 'check', value: T): T => {
    decided.push({ kind, value });
    return value;
  };
  const provider: InputProvider = {
    rollDice,
    choose: (choices, quantity) => answered('choose') ? replay.choose(choices, quantity) : ask({
      kind: 'choose',
      choices: choices.map(choice => ({ _id: choice._id, name: choice.name, type: choice.type })),
    }),
    advantage: async suggested => answered('advantage') ? replay.advantage(suggested)
      : decide('advantage', advantage ?? suggested),
    check: async suggested => answered('check') ? replay.check(suggested)
      : decide('check', { ...suggested, advantage: advantage ?? suggested.advantage } as CheckParams),
  };
  try {
    await applyAction(action, provider, { simulate: true });
  } catch (e) {
    if (e !== ASKED) throw e;
  }
  return { ...question && { question }, dice: dice.count, decided };
}

/**
 * Records that the action's first `dice` dice were shown, as drawDice does
 * for the browser: a question that follows a roll tells something of it (a
 * hit's branch), and an action left after that is logged as abandoned
 * (removeActions). Never lowers what was recorded
 */
export async function revealDice(actionId: string, dice: number) {
  if (dice > 0) await EngineActions.updateAsync({ _id: actionId }, { $max: { revealedCursor: dice } });
}
