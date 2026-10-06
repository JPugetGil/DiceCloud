import { createHmac } from 'node:crypto';
import { Meteor } from 'meteor/meteor';
import getDeterministicDiceRoller, {
  diceCount, drawDiceAt, type DiceRequest,
} from '/imports/api/engine/action/functions/userInput/getDeterministicDiceRoller';

/*
 * The dice of an action, on the server only: node:crypto is not in the
 * client's bundle, and the client never has an action's seed anyway.
 *
 * Die number `position` of an action (counted from 0, one position per die,
 * in the order the action rolls them) is HMAC-SHA256(seed, position): no one
 * can tell a die from the others without the seed, which insertAction draws
 * and never sends, and any die can be computed on its own, without rolling the
 * ones before it. An action inserted before actions had a seed rolls from its
 * id, with Alea, as it did then.
 */

// Four 64-bit words per HMAC
const WORD_BYTES = 8;
const TWO_TO_THE_64 = BigInt(2) ** BigInt(64);

/**
 * Die number `position` of the seed's sequence, between 1 and `faces`.
 *
 * The HMAC is read as 64-bit words, and a word is kept only below the largest
 * multiple of `faces` under 2^64, so that every face is exactly as likely
 * (rejection sampling). A word is rejected with a probability under
 * faces / 2^64: 1e-18 for a d20, 2^-11 for the largest number of faces the
 * engine can ask for (2^53). The first of the four words is kept in practice;
 * if all four are rejected, the next HMAC of the same position, ":1", ":2"...
 * gives four more.
 *
 * A die with fewer than two faces shows 1, as the dice always did for a d1 or
 * a d0, and still takes its position.
 */
export function seededDie(seed: string, position: number, faces: number): number {
  if (!(faces >= 2)) return 1;
  const size = BigInt(faces);
  const limit = TWO_TO_THE_64 - TWO_TO_THE_64 % size;
  for (let block = 0; ; block += 1) {
    const message = block ? `${position}:${block}` : `${position}`;
    const digest = createHmac('sha256', seed).update(message).digest();
    for (let offset = 0; offset < digest.length; offset += WORD_BYTES) {
      const word = digest.readBigUInt64BE(offset);
      if (word < limit) return Number(word % size) + 1;
    }
  }
}

/**
 * The dice a seed gives from position `cursor` on, as an action rolls them
 * once `cursor` dice have been rolled before
 */
export function drawSeededDiceAt(seed: string, cursor: number, dice: DiceRequest): number[][] {
  if (!seed) throw new Meteor.Error('Id Required', 'the seed can not be ' + seed);
  let position = cursor;
  return dice.map(({ number, diceSize }) => {
    if (number > 100) {
      throw new Meteor.Error('Too many dice', 'can only roll up to 100 dice at once');
    }
    const values: number[] = [];
    for (let i = 0; i < number; i++) {
      values.push(seededDie(seed, position, diceSize));
      position += 1;
    }
    return values;
  });
}

type ActionWithDice = { _id?: string, seed?: string };

/**
 * The dice of an action from position `cursor` on: from its seed, or from its
 * id for an action inserted before actions had a seed
 */
export function drawActionDiceAt(action: ActionWithDice, cursor: number, dice: DiceRequest): number[][] {
  if (action.seed) return drawSeededDiceAt(action.seed, cursor, dice);
  return drawDiceAt(action._id as string, cursor, dice);
}

/**
 * InputProvider.rollDice for an action, from its first die: each roll takes
 * the next dice of the action's sequence, the dice the server gave the client
 * one roll at a time (drawDice). runAction's replay
 */
export function getActionDiceRoller(action: ActionWithDice): (dice: DiceRequest) => Promise<number[][]> {
  const { seed } = action;
  if (!seed) return getDeterministicDiceRoller(action._id as string);
  let cursor = 0;
  return async (dice) => {
    const values = drawSeededDiceAt(seed, cursor, dice);
    cursor += diceCount(dice);
    return values;
  };
}
