import InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import getDeterministicDiceRoller from '/imports/api/engine/action/functions/userInput/getDeterministicDiceRoller';

/**
 * Replays the user's decisions, in exactly the order they will be requested.
 * Dice are rolled again from the action's seed, from the first die: the
 * dice in the decisions are ignored, no cheating. The server gave the client
 * these same dice, one roll at a time (drawDice), while the user played the
 * action.
 *
 * `replayDice` is only for the client's simulation of runAction (a method
 * stub), which has no seed: it shows the dice the server drew, until the
 * server's own results replace them. The server never sets it.
 */
export default function getReplayChoicesInputProvider(
  seed: string, decisions: any[], { replayDice = false } = {},
): InputProvider {
  const decisionStack = [...decisions].reverse();
  const dRoller = getDeterministicDiceRoller(seed);
  const replaySavedInput: InputProvider = {
    nextStep() {
      return Promise.resolve();
    },
    // To roll dice, ignore the user and use the deterministic dice roller again
    rollDice(dice) {
      const decided = decisionStack.pop();
      if (replayDice && Array.isArray(decided)) return Promise.resolve(decided);
      return dRoller(dice);
    },
    choose() {
      return Promise.resolve(decisionStack.pop());
    },
    advantage() {
      return Promise.resolve(decisionStack.pop());
    },
    check() {
      return Promise.resolve(decisionStack.pop());
    },
  }
  return replaySavedInput;
}
