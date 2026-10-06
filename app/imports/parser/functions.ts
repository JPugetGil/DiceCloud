import type ResolveLevel from '/imports/parser/types/ResolveLevel';
import type Context from '/imports/parser/types/Context';
import type InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import resolve from '/imports/parser/resolve'
import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';

/**
 * A function of the formulas. It runs with `this` holding the resolution's
 * scope, context and input provider (call.ts): a function that rolls dice
 * rolls them with `this.inputProvider.rollDice`, like a roll node, so that in
 * an action they are the action's dice, which the server draws from the
 * action's secret seed and replays in runAction (doAction, drawDice)
 */
export type ParserFunction = {
  comment: string;
  examples: { input: string, result: string }[];
  arguments: string[];
  maxResolveLevels?: ResolveLevel[];
  minArguments?: number,
  maxArguments?: number,
  resultType: string;
  fn: (this: ParserFunctionThis, ...args: any[]) => any;
}

type ParserFunctionThis = {
  scope: Record<string, any>;
  context: Context;
  inputProvider: InputProvider;
}

// The most dice a roll can hold, rerolled and exploded dice included
const MAX_ROLL_VALUES = STORAGE_LIMITS.diceRollValuesCount;

const parserFunctions: { [name: string]: ParserFunction } = {
  'abs': {
    comment: 'Returns the absolute value of a number',
    examples: [
      { input: 'abs(9)', result: '9' },
      { input: 'abs(-3)', result: '3' },
    ],
    arguments: ['number'],
    resultType: 'number',
    fn: Math.abs,
  },
  'sqrt': {
    comment: 'Returns the square root of a number',
    examples: [
      { input: 'sqrt(16)', result: '4' },
      { input: 'sqrt(10)', result: '3.1622776601683795' },
    ],
    arguments: ['number'],
    resultType: 'number',
    fn: Math.sqrt,
  },
  'max': {
    comment: 'Returns the largest of the given numbers',
    examples: [{ input: 'max(12, 6, 3, 168)', result: '168' }],
    arguments: anyNumberOf('number'),
    resultType: 'number',
    fn: Math.max,
  },
  'min': {
    comment: 'Returns the smallest of the given numbers',
    examples: [{ input: 'min(12, 6, 3, 168)', result: '3' }],
    arguments: anyNumberOf('number'),
    resultType: 'number',
    fn: Math.min,
  },
  'round': {
    comment: 'Returns the value of a number rounded to the nearest integer',
    examples: [
      { input: 'round(5.95)', result: '6' },
      { input: 'round(5.5)', result: '6' },
      { input: 'round(5.05)', result: '5' },
    ],
    arguments: ['number'],
    resultType: 'number',
    fn: Math.round,
  },
  'floor': {
    comment: 'Rounds a number down to the next smallest integer',
    examples: [
      { input: 'floor(5.95)', result: '5' },
      { input: 'floor(5.05)', result: '5' },
      { input: 'floor(5)', result: '5' },
      { input: 'floor(-5.5)', result: '-6' },
    ],
    arguments: ['number'],
    resultType: 'number',
    fn: Math.floor,
  },
  'ceil': {
    comment: 'Rounds a number up to the next largest integer',
    examples: [
      { input: 'ceil(5.95)', result: '6' },
      { input: 'ceil(5.05)', result: '6' },
      { input: 'ceil(5)', result: '5' },
      { input: 'ceil(-5.5)', result: '-5' },
    ],
    arguments: ['number'],
    resultType: 'number',
    fn: Math.ceil,
  },
  'trunc': {
    comment: 'Returns the integer part of a number by removing any fractional digits',
    examples: [
      { input: 'trunc(5.95)', result: '5' },
      { input: 'trunc(5.05)', result: '5' },
      { input: 'trunc(5)', result: '5' },
      { input: 'trunc(-5.5)', result: '-5' },
    ],
    arguments: ['number'],
    resultType: 'number',
    fn: Math.trunc,
  },
  'sign': {
    comment: 'Returns either a positive or negative 1, indicating the sign of a number, or zero',
    examples: [
      { input: 'sign(-3)', result: '-1' },
      { input: 'sign(3)', result: '1' },
      { input: 'sign(0)', result: '0' },
    ],
    arguments: ['number'],
    resultType: 'number',
    fn: Math.sign,
  },
  'tableLookup': {
    comment: 'Returns the index of the last value in the array that is less than the specified amount',
    examples: [
      { input: 'tableLookup([100, 300, 900], 457)', result: '2' },
      { input: 'tableLookup([100, 300, 900], 23)', result: '0' },
      { input: 'tableLookup([100, 300, 900, 1200], 900)', result: '3' },
      { input: 'tableLookup([100, 300], 594)', result: '2' },
    ],
    arguments: ['array', 'number'],
    resultType: 'number',
    fn: function tableLookup(arrayNode, number) {
      for (const i in arrayNode.values) {
        const node = arrayNode.values[i];
        if (node.value > number) return +i;
      }
      return arrayNode.values.length;
    }
  },
  'resolve': {
    comment: 'Forces the given calculation to resolve into a number, even in calculations where it would usually keep the unknown values as is',
    examples: [
      { input: 'resolve(someUndefinedVariable + 3 + 4)', result: '7' },
      { input: 'resolve(1d6)', result: '4' },
    ],
    arguments: ['parseNode'],
    resultType: 'parseNode',
    fn: async function resolveFn(node) {
      const { result } = await resolve('reduce', node, this.scope, this.context, this.inputProvider);
      return result;
    }
  },
  'dropLowest': {
    comment: 'Removes one or more of the lowest values in a roll',
    examples: [
    ],
    arguments: ['rollArray', 'number'],
    maxResolveLevels: ['roll', 'reduce'],
    minArguments: 1,
    maxArguments: 2,
    resultType: 'rollArray',
    fn: function dropLowestFn(rollArray, numberToDrop = 1) {
      // Create a new array where the values are sorted in ascending order 
      const sortedArray = [...rollArray.values].sort(function (a, b) {
        return a.value - b.value;
      });

      // mark the N smallest elements as dropped
      for (let i = 0; i < numberToDrop; i += 1) {
        sortedArray[i].disabled = true;
        sortedArray[i].disabledBy = 'dropLowest';
      }
      return rollArray;
    },
  },
  'dropHighest': {
    comment: 'Removes one or more of the highest values in a roll',
    examples: [
    ],
    arguments: ['rollArray', 'number'],
    maxResolveLevels: ['roll', 'reduce'],
    minArguments: 1,
    maxArguments: 2,
    resultType: 'rollArray',
    fn: function dropHighestFn(rollArray, numberToDrop = 1) {
      // Create a new array where the values are sorted in ascending order 
      const sortedArray = [...rollArray.values].sort(function (a, b) {
        return b.value - a.value;
      });

      // mark the N smallest elements as dropped
      for (let i = 0; i < numberToDrop; i += 1) {
        sortedArray[i].disabled = true;
        sortedArray[i].disabledBy = 'dropHighest';
      }
      return rollArray;
    },
  },
  'reroll': {
    comment: 'Rerolls if a number is less than or equal to the given value',
    examples: [
    ],
    arguments: ['rollArray', 'number', 'boolean'],
    maxResolveLevels: ['roll', 'reduce'],
    minArguments: 1,
    maxArguments: 3,
    resultType: 'rollArray',
    fn: async function rerollFn(rollArray, numberToReroll = 1, keepNewRoll = false) {
      const rollValues = rollArray.values;
      // Every die at or under the limit is disabled and rolled again, its new
      // roll inserted right after it. Unless the new rolls are kept, a new
      // roll at or under the limit is rolled again in turn. The dice of each
      // round are rolled at once: in an action, one request to the server
      let toReroll = rollValues.filter(roll => roll.value <= numberToReroll);
      while (toReroll.length) {
        if (rollValues.length + toReroll.length > MAX_ROLL_VALUES) {
          this.context.error(`Can't roll more than ${MAX_ROLL_VALUES} dice at once`);
          return rollArray;
        }
        const [values] = await this.inputProvider.rollDice([{
          number: toReroll.length, diceSize: rollArray.diceSize,
        }]);
        const newRolls = values.map(value => ({ value }));
        toReroll.forEach((roll, i) => {
          roll.disabled = true;
          roll.disabledBy = 'reroll';
          rollValues.splice(rollValues.indexOf(roll) + 1, 0, newRolls[i]);
        });
        if (keepNewRoll) break;
        toReroll = newRolls.filter(roll => roll.value <= numberToReroll);
      }
      return rollArray;
    },
  },
  'explode': {
    comment: 'Rerolls if a number is greater than or equal to the given value',
    examples: [
    ],
    arguments: ['rollArray', 'number', 'number'],
    maxResolveLevels: ['roll', 'reduce', 'reduce'],
    minArguments: 1,
    maxArguments: 3,
    resultType: 'rollArray',
    fn: async function explodeFn(rollArray, depth = 1, numberToReroll = rollArray.diceSize) {
      let overflowErrored = false;
      if (depth > 99) depth = 99;
      const rollValues = rollArray.values;
      // Every die at or over the limit explodes: a new die is rolled and
      // inserted after it, and while the new die is at or over the limit too,
      // another, up to `depth` new dice. The new dice of each round are rolled
      // at once: in an action, one request to the server
      let exploding = rollValues
        .filter(roll => roll.value >= numberToReroll)
        .map(roll => {
          roll.bold = true;
          return { last: roll, added: 0 };
        });
      while (exploding.length) {
        // The roll never holds more than 100 dice
        const room = MAX_ROLL_VALUES - rollValues.length;
        if (exploding.length > room) {
          if (!overflowErrored) {
            this.context.error(`Can't roll more than ${MAX_ROLL_VALUES} dice at once`);
            overflowErrored = true;
          }
          exploding = exploding.slice(0, Math.max(room, 0));
          if (!exploding.length) break;
        }
        const [values] = await this.inputProvider.rollDice([{
          number: exploding.length, diceSize: rollArray.diceSize,
        }]);
        exploding.forEach((chain, i) => {
          const rollObj = {
            value: values[i],
            italics: true,
          };
          rollValues.splice(rollValues.indexOf(chain.last) + 1, 0, rollObj);
          chain.last = rollObj;
          chain.added += 1;
        });
        exploding = exploding.filter(chain => chain.added < depth && chain.last.value >= numberToReroll);
      }
      return rollArray;
    },
  },
}

function anyNumberOf(type) {
  const argumentArray: any = [type];
  argumentArray.anyLength = true;
  return argumentArray;
}

export default parserFunctions;
