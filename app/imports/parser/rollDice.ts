import { DDP } from 'meteor/ddp';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';

/**
 * Dice rolled outside an action: a roll typed in the log (logRoll), a formula
 * that the sheet's computation or a page resolves (resolve.ts's default input
 * provider). An action's dice never come from here: its input provider rolls
 * them from the action's secret seed (drawDice, runAction), reroll() and
 * explode() included.
 *
 * On the server, from Meteor's Random, a cryptographic generator. In a method,
 * DDP.randomStream follows the randomSeed the client sends with the call, so
 * that the client's simulation rolls the same dice: a modified client could
 * try seeds offline and choose the dice of its log rolls. The client keeps the
 * stream, for what it resolves on its own; logRoll leaves its rolls to the
 * server.
 */
export default function rollDice(number: number, diceSize: number): number[] {
  const values: number[] = [];
  const randomSrc = Meteor.isServer ? Random : DDP.randomStream('diceRoller');
  if (number > 100) {
    throw new Meteor.Error('Too many dice', 'can only roll up to 100 dice at once');
  }
  for (let i = 0; i < number; i++) {
    const roll = ~~(randomSrc.fraction() * diceSize) + 1
    values.push(roll);
  }
  return values;
}
