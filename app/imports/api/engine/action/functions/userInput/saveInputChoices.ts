import type { EngineAction } from '/imports/api/engine/action/EngineActions';
import type InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';

/**
 * The kinds of decisions a user makes while an action is simulated, which
 * runAction replays: the dice the server gave (drawDice), the choices, the
 * advantage of a roll and the options of a check
 */
export const DECISION_KINDS = ['rollDice', 'choose', 'advantage', 'check'] as const;

export type DecisionKind = typeof DECISION_KINDS[number];

/** A decision, by kind: runAction replays each kind in its own order (getReplayChoicesInputProvider) */
export type Decision = { kind: DecisionKind, value: unknown };

/**
 * A new version of the user input, which saves each decision to
 * action._decisions with its kind before returning it. Moving on to the next
 * step is no decision, and a hidden target's dice are the server's
 * (rollHiddenDice): both pass through
 */
export default function saveInputChoices(action: EngineAction, userInput: InputProvider): InputProvider {
  if (!action._decisions) {
    action._decisions = [];
  }
  const saving: InputProvider = { ...userInput };
  for (const kind of DECISION_KINDS) {
    const decide = userInput[kind] as (...args: any[]) => Promise<unknown>;
    (saving as any)[kind] = async (...args: any[]) => {
      const value = await decide.apply(userInput, args);
      action._decisions?.push({ kind, value });
      return value;
    };
  }
  return saving;
}
