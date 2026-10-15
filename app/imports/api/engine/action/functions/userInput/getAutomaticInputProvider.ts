import { EngineAction } from '/imports/api/engine/action/EngineActions';
import InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import TaskResult from '/imports/api/engine/action/tasks/TaskResult';
import getPropertyTitle from '/imports/api/utility/getPropertyTitle';
import { logLine, msg } from '/imports/api/creature/log/logMessages';

/**
 * A choice nobody made: nothing is chosen, and the actor's log says so, with
 * what could have been chosen
 */
export async function leaveChoiceUnmade(
  action: EngineAction, choices: Parameters<InputProvider['choose']>[0],
): Promise<string[]> {
  const result = new TaskResult([action.creatureId]);
  result.appendLog(logLine({
    name: msg('logs.choiceNotMade'),
    value: choices.map(choice => getPropertyTitle(choice as any)).join(', '),
    silenced: false,
  }), [action.creatureId]);
  action.results.push(result);
  return [];
}

/**
 * The input of an action that the server applies on its own, which nobody
 * gives: a creature's turn starting or ending (runTurnEvent), its triggers
 * firing on its behalf after another creature's action (ReceivedDamageTask).
 * A choice is left unmade, with a line that says so; a roll's advantage and a
 * check's options are the suggested ones. The dice are the caller's, and
 * those of a target hidden from the creature's readers, if the caller rolls
 * them, so that the server resolves what such a target does
 */
export default function getAutomaticInputProvider(
  action: EngineAction, rollDice: InputProvider['rollDice'], rollHiddenDice?: InputProvider['rollHiddenDice'],
): InputProvider {
  return {
    rollDice,
    ...rollHiddenDice && { rollHiddenDice },
    async choose(choices) {
      return leaveChoiceUnmade(action, choices);
    },
    async advantage(suggested) {
      return suggested;
    },
    async check(suggested) {
      return suggested;
    },
  };
}
