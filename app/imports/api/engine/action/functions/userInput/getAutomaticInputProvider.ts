import { EngineAction } from '/imports/api/engine/action/EngineActions';
import InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import TaskResult from '/imports/api/engine/action/tasks/TaskResult';
import getPropertyTitle from '/imports/api/utility/getPropertyTitle';
import { logLine, msg } from '/imports/api/creature/log/logMessages';

/**
 * The input of an action that the server applies on its own, which nobody
 * gives: a creature's turn starting or ending (runTurnEvent), its triggers
 * firing on its behalf after another creature's action (ReceivedDamageTask).
 * A choice is left unmade, with a line that says so; a roll's advantage and a
 * check's options are the suggested ones. The dice are the caller's
 */
export default function getAutomaticInputProvider(
  action: EngineAction, rollDice: InputProvider['rollDice'],
): InputProvider {
  return {
    rollDice,
    async choose(choices) {
      const result = new TaskResult([action.creatureId]);
      result.appendLog(logLine({
        name: msg('logs.choiceNotMade'),
        value: choices.map(choice => getPropertyTitle(choice as any)).join(', '),
        silenced: false,
      }), [action.creatureId]);
      action.results.push(result);
      return [];
    },
    async advantage(suggested) {
      return suggested;
    },
    async check(suggested) {
      return suggested;
    },
  };
}
