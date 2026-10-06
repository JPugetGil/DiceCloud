import Alea from 'alea';
import { Meteor } from 'meteor/meteor';

export type DiceRequest = { number: number, diceSize: number }[];

/**
 * Return a function that can be be used as InputProvider.rollDice
 * this function instance must be used for the entire action
 *
 * The dice come from Alea, a random number generator seeded with `seed`, one
 * value per die, in the order they are asked for: the same seed gives the same
 * dice in the same order. Alea is no cryptographic generator: an action with a
 * secret seed rolls with HMAC-SHA256 on the server instead (server/actionDice).
 * This one rolls the dice of an action inserted before actions had a seed,
 * from its id, and those of a preview (previewAction), which nothing records.
 */
export default function getDeterministicDiceRoller(
  seed: string
): (dice: DiceRequest) => Promise<number[][]> {
  // Create a random number generator seeded on the action's seed
  if (!seed) throw new Meteor.Error('Id Required', 'the seed can not be ' + seed)
  const randFrac = Alea(seed);
  return (dice) => {
    try {
      return Promise.resolve(rollWith(randFrac, dice));
    } catch (e) {
      return Promise.reject(e);
    }
  }
}

/**
 * The dice a seed gives at a position: the dice drawn after the first
 * `cursor` values of Alea's sequence, as getDeterministicDiceRoller would roll
 * them once `cursor` dice have been rolled before
 */
export function drawDiceAt(seed: string, cursor: number, dice: DiceRequest): number[][] {
  if (!seed) throw new Meteor.Error('Id Required', 'the seed can not be ' + seed)
  const randFrac = Alea(seed);
  for (let i = 0; i < cursor; i++) randFrac();
  return rollWith(randFrac, dice);
}

// How many values of the sequence a roll uses: one per die
export function diceCount(dice: DiceRequest) {
  return dice.reduce((total, { number }) => total + Math.max(0, number), 0);
}

function rollWith(randFrac: () => number, dice: DiceRequest): number[][] {
  const results: number[][] = [];
  for (const diceRoll of dice) {
    const values: number[] = [];
    if (diceRoll.number > 100) {
      throw new Meteor.Error('Too many dice', 'can only roll up to 100 dice at once');
    }
    for (let i = 0; i < diceRoll.number; i++) {
      const rolledValue = ~~(randFrac() * diceRoll.diceSize) + 1
      values.push(rolledValue);
    }
    results.push(values);
  }
  return results;
}
