import { assert } from 'chai';
import fc from 'fast-check';
import { parse } from '/imports/parser/parser';
import resolve from '/imports/parser/resolve';
import toString from '/imports/parser/toString';
import traverse from '/imports/parser/traverse';
import Context from '/imports/parser/types/Context';
import type InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import type ParseNode from '/imports/parser/parseTree/ParseNode';

/*
 * Properties of the formula language, on random formulas: the printer and
 * the parser agree, the grammar is unambiguous, and compiling a formula (what
 * the sheet shows: "1d6 + 3" for "1d6 + strengthMod") keeps its meaning.
 */

// FC_NUM_RUNS=20000 meteor npm test searches longer
const runs = { numRuns: Number(process.env.FC_NUM_RUNS) || 300, includeErrorInReport: true };

// The formulas' variables, with the values the meaning is checked with
const scope = { strength: { value: 3 }, level: { value: 5 }, bonus: { value: -2 } };
const variable = fc.constantFrom(...Object.keys(scope));
const number = fc.oneof(
  fc.integer({ min: 0, max: 20 }).map(String),
  fc.tuple(fc.integer({ min: 0, max: 9 }), fc.integer({ min: 1, max: 9 })).map(([a, b]) => `${a}.${b}`),
);
const dice = fc.oneof(
  fc.tuple(fc.integer({ min: 1, max: 4 }), fc.constantFrom(4, 6, 8, 10, 12, 20)).map(([n, size]) => `${n}d${size}`),
  fc.constantFrom(4, 6, 8, 20).map(size => `d${size}`),
);
const binaryOperators = ['+', '-', '*', '/', '%', '^', '>', '<', '>=', '<=', '==', '!=', '&&', '||'];

// Formulas as a user types them: any precedence, parentheses or not
const { formula } = fc.letrec<{ formula: string, atom: string }>(tie => ({
  atom: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    number, variable, dice, fc.constantFrom('true', 'false'),
    tie('formula').map(f => `(${f})`),
    fc.tuple(fc.constantFrom('max', 'min'), tie('formula'), tie('formula')).map(([fn, a, b]) => `${fn}(${a}, ${b})`),
    fc.tuple(fc.constantFrom('floor', 'ceil', 'abs'), tie('formula')).map(([fn, a]) => `${fn}(${a})`),
  ),
  formula: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    tie('atom'),
    fc.tuple(tie('formula'), fc.constantFrom(...binaryOperators), tie('formula')).map(([a, op, b]) => `${a} ${op} ${b}`),
    fc.tuple(fc.constantFrom('-', '!'), tie('atom')).map(([op, a]) => `${op}${a}`),
    fc.tuple(tie('formula'), tie('formula'), tie('formula')).map(([c, a, b]) => `(${c} ? ${a} : ${b})`),
  ),
}));

/** The tree, or undefined when the text is no formula (some random texts are not) */
function tryParse(text: string): ParseNode | undefined {
  try {
    return parse(text);
  } catch {
    return undefined;
  }
}

// Every die shows the same face for both formulas compared: the smaller of 3
// and its size. As rollDice, no die for a negative number of them
const fixedDice: InputProvider = {
  async rollDice(dice) {
    return dice.map(({ number, diceSize }) => Array(Math.max(0, number)).fill(Math.min(3, diceSize)));
  },
  async choose() { return []; },
  async advantage() { return 0; },
  async check(params) { return params; },
};

/**
 * Whether the tree holds a number its text does not give back: NaN or an
 * infinity, which print as names ("NaN" reads back as a variable), one
 * JavaScript prints in exponent notation, from 1e21 or below 1e-6
 * ("d1.31072e+22"), and -0, which prints as 0 (1 / -0 is -Infinity). The
 * sheet shows them as they are; no formula a user types gives them
 */
function holdsUnreadableNumber(node: ParseNode) {
  let found = false;
  traverse(node, child => {
    if (child.parseType !== 'constant' || typeof child.value !== 'number') return;
    if (/[a-z]/i.test(String(child.value)) || Object.is(child.value, -0)) found = true;
  });
  return found;
}

const isNumber = (text: string) => text.trim() !== '' && Number.isFinite(Number(text));

/** A formula's value with the scope's variables and the fixed dice, and whether it erred */
async function evaluate(node: ParseNode) {
  const context = new Context();
  const { result } = await resolve('reduce', node, scope, context, fixedDice);
  return { value: toString(result), erred: context.errors.length > 0 };
}

describe('Formulas (properties)', function () {
  this.timeout(30000 + runs.numRuns * 2);
  let warn: typeof console.warn;
  let warnings: unknown[][];
  beforeEach(function () {
    warn = console.warn;
    warnings = [];
    console.warn = (...args) => warnings.push(args);
  });
  afterEach(function () {
    console.warn = warn;
  });

  it('parse each formula one way only', function () {
    fc.assert(fc.property(formula, text => {
      const tree = tryParse(text);
      fc.pre(!!tree);
      assert.deepEqual(warnings, [], `ambiguous: ${text}`);
    }), runs);
  });

  it('read back what they print: the same tree', function () {
    fc.assert(fc.property(formula, text => {
      const tree = tryParse(text);
      fc.pre(!!tree);
      const printed = toString(tree!);
      assert.deepEqual(tryParse(printed), tree, `${text} printed as ${printed}`);
    }), runs);
  });

  it('keep their meaning once compiled and printed, as the sheet shows them', async function () {
    await fc.assert(fc.asyncProperty(formula, async text => {
      const tree = tryParse(text);
      fc.pre(!!tree);
      // A formula in error ("!1d4": false dice) shows its error, not a formula
      const expected = await evaluate(tree!);
      fc.pre(!expected.erred);
      const { result: compiled } = await resolve('compile', tree!, scope, new Context(), fixedDice);
      // The sheet shows "NaN", "1e+22" or 0 for -0 as they are, no formula to read back
      fc.pre(!holdsUnreadableNumber(compiled));
      const shown = toString(compiled);
      const reread = tryParse(shown);
      assert.exists(reread, `${text} compiles to ${shown}, which does not parse`);
      const { value } = await evaluate(reread!);
      const message = `${text} compiles to ${shown}`;
      // Compiling adds the constants first: 0.1 + 1 + 3.1 is 4.2, but 4.1 + 0.1 is 4.199999999999999
      if (isNumber(value) && isNumber(expected.value)) {
        assert.approximately(+value, +expected.value, 1e-9 * Math.max(1, Math.abs(+expected.value)), message);
      } else {
        assert.equal(value, expected.value, message);
      }
    }), runs);
  });
});
