import { Meteor } from 'meteor/meteor';
import { drawDice } from '/imports/api/engine/action/methods/drawDice';
import { diceCount, type DiceRequest } from '/imports/api/engine/action/functions/userInput/getDeterministicDiceRoller';

// The dice the server has drawn for the latest actions, by position and
// request: the dialog simulates an action again from the start (doAction,
// then ActionDialog), and gets its first dice back without asking again
const MAX_CACHED_ACTIONS = 4;
const drawnDice = new Map<string, Map<string, number[][]>>();

function cacheOf(actionId: string) {
  let cache = drawnDice.get(actionId);
  if (!cache) {
    cache = new Map();
    drawnDice.set(actionId, cache);
    // Forget the oldest actions: they have run or been replaced
    while (drawnDice.size > MAX_CACHED_ACTIONS) {
      drawnDice.delete(drawnDice.keys().next().value as string);
    }
  }
  return cache;
}

type DrawFn = (args: { actionId: string, cursor: number, dice: DiceRequest }) => Promise<number[][]>;

/**
 * InputProvider.rollDice for the client's simulation of an action: the dice
 * come from the server (drawDice), which alone knows the action's seed, in the
 * order the action asks for them, as getDeterministicDiceRoller would roll
 * them from the seed. Each roll asks the server, once: a new simulation of the
 * same action (a new roller) gets the dice it already drew from a cache.
 *
 * `draw` is drawDice's call, which tests replace.
 */
export default function getServerDiceRoller(
  actionId: string,
  // The typings pick callAsync's overload with a callback, which returns nothing
  draw: DrawFn = args => drawDice.callAsync(args) as unknown as Promise<number[][]>,
): (dice: DiceRequest) => Promise<number[][]> {
  if (!actionId) throw new Meteor.Error('Id Required', 'action ID can not be ' + actionId);
  let cursor = 0;
  return async (dice) => {
    // As the local roller does: no die for a negative number, at most 100
    const request = dice.map(({ number, diceSize }) => ({ number: Math.max(0, number), diceSize }));
    if (request.some(({ number }) => number > 100)) {
      throw new Meteor.Error('Too many dice', 'can only roll up to 100 dice at once');
    }
    const start = cursor;
    const count = diceCount(request);
    cursor += count;
    if (!count) return request.map(() => []);
    const cache = cacheOf(actionId);
    const key = `${start}:${JSON.stringify(request)}`;
    let values = cache.get(key);
    if (!values) {
      values = await draw({ actionId, cursor: start, dice: request });
      cache.set(key, values);
    }
    // Copies: the engine may change what it is given
    return values.map(roll => [...roll]);
  };
}
