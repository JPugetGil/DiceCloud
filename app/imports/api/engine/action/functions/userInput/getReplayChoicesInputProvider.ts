import InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';

/**
 * Replays the user's decisions, in exactly the order they will be requested.
 * Dice are rolled again by `actionDice`, the action's dice from the first
 * (getActionDiceRoller): the dice in the decisions are ignored, no cheating.
 * The server gave the client these same dice, one roll at a time (drawDice),
 * while the user played the action.
 *
 * `replayDice` is only for the client's simulation of runAction (a method
 * stub), which has no seed: it shows the dice the server drew, until the
 * server's own results replace them. The server never sets it.
 */
export default function getReplayChoicesInputProvider(
  actionDice: InputProvider['rollDice'], decisions: any[], { replayDice = false } = {},
): InputProvider {
  const decisionStack = [...decisions].reverse();
  const replaySavedInput: InputProvider = {
    nextStep() {
      return Promise.resolve();
    },
    // To roll dice, ignore the user and roll the action's dice again
    rollDice(dice) {
      const decided = decisionStack.pop();
      if (replayDice && Array.isArray(decided)) return Promise.resolve(decided);
      return actionDice(dice);
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
