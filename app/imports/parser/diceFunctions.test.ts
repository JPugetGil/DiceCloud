import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { DDP } from 'meteor/ddp';
import { parse } from '/imports/parser/parser';
import resolve from '/imports/parser/resolve';
import toString from '/imports/parser/toString';
import rollDice from '/imports/parser/rollDice';
import { Random } from 'meteor/random';
import CreatureLogs, { logRoll } from '/imports/api/creature/log/CreatureLogs';
import type InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import inputProviderForTests from '/imports/api/engine/action/functions/userInput/inputProviderForTests.testFn';

/**
 * An input provider that hands out the given dice in order (then `fallback`),
 * and records what each roll asked for
 */
function scriptedDice(values: number[], fallback?: number) {
  const requests: string[] = [];
  const queue = [...values];
  const provider: InputProvider = {
    ...inputProviderForTests,
    async rollDice(dice) {
      requests.push(dice.map(({ number, diceSize }) => `${number}d${diceSize}`).join(' '));
      return dice.map(({ number }) => Array.from({ length: number }, () => queue.shift() ?? fallback as number));
    },
  };
  return { provider, requests };
}

async function rollFormula(formula: string, provider: InputProvider) {
  const { result: rolled, context } = await resolve('roll', parse(formula), {}, undefined, provider);
  const { result: reduced } = await resolve('reduce', rolled, {}, context, provider);
  return { rolled: toString(rolled), total: toString(reduced), errors: context.errors.map(e => e.message) };
}

/*
 * reroll(), explode() and resolve() roll their dice with the input provider,
 * as a roll node does: in an action, the action's dice, drawn by the server
 * from its secret seed (see actionDice.test.ts). They used to roll from the
 * method call's random stream, which the client seeds.
 */
describe('Dice functions roll through the input provider', function () {
  it('rerolls the dice at or under the limit, each round at once, until a new roll is over it', async function () {
    const { provider, requests } = scriptedDice([1, 5, 2, 6, 3, 1, 4]);
    const { rolled, total } = await rollFormula('reroll(4d6, 2)', provider);
    assert.deepEqual(requests, ['4d6', '2d6', '1d6']);
    assert.equal(rolled, '4d6 [~~1~~, 3, 5, ~~2~~, ~~1~~, 4, 6]');
    assert.equal(total, '18');
  });

  it('rerolls once and keeps the new roll when asked to', async function () {
    const { provider, requests } = scriptedDice([1, 5, 2, 6, 1, 2]);
    const { rolled, total } = await rollFormula('reroll(4d6, 2, true)', provider);
    assert.deepEqual(requests, ['4d6', '2d6']);
    assert.equal(rolled, '4d6 [~~1~~, 1, 5, ~~2~~, 2, 6]');
    assert.equal(total, '14');
  });

  it('explodes the dice at or over the limit, up to the depth, each round at once', async function () {
    const once = scriptedDice([6, 2, 6, 6, 3]);
    assert.equal((await rollFormula('explode(3d6)', once.provider)).rolled, '3d6 [**6**, *6*, 2, **6**, *3*]');
    assert.deepEqual(once.requests, ['3d6', '2d6']);

    const deeper = scriptedDice([6, 2, 6, 6, 3, 6, 1]);
    const { rolled, total } = await rollFormula('explode(3d6, 3)', deeper.provider);
    assert.deepEqual(deeper.requests, ['3d6', '2d6', '1d6', '1d6']);
    assert.equal(rolled, '3d6 [**6**, *6*, *6*, *1*, 2, **6**, *3*]');
    assert.equal(total, '30');

    const lower = scriptedDice([5, 4, 2, 5, 1]);
    assert.equal((await rollFormula('explode(3d6, 1, 4)', lower.provider)).rolled, '3d6 [**5**, *5*, **4**, *1*, 2]');
  });

  it('never makes a roll of more than 100 dice', async function () {
    // Every new roll is a 1, rolled again without end
    const endless = scriptedDice([], 1);
    const rerolled = await rollFormula('reroll(1d6, 6)', endless.provider);
    assert.include(rerolled.errors, 'Can\'t roll more than 100 dice at once');
    assert.isAtMost(rerolled.rolled.split(',').length, 100);

    const exploding = scriptedDice([], 1);
    const exploded = await rollFormula('explode(60d1, 99)', exploding.provider);
    assert.deepEqual(exploded.errors, ['Can\'t roll more than 100 dice at once'], 'said once');
    assert.equal(exploded.rolled.split(',').length, 100);
  });

  it('resolves resolve() with the same provider', async function () {
    // Compiled, as an action compiles a calculation before it rolls it: the
    // dice inside resolve() are rolled by the function itself
    const { provider, requests } = scriptedDice([17]);
    const { result } = await resolve('compile', parse('resolve(1d20)'), {}, undefined, provider);
    assert.equal(toString(result), '17');
    assert.deepEqual(requests, ['1d20']);
  });
});

if (Meteor.isServer) describe('Dice outside an action, on the server', function () {
  it('do not follow the random seed the client sends with a method call', async function () {
    // Two method calls with the same seed, as a client trying seeds would make
    const rollIn = (randomSeed: string) => (DDP as any)._CurrentMethodInvocation.withValue(
      { randomSeed, isSimulation: false }, () => rollDice(30, 20),
    ) as number[];
    const first = rollIn('chosen-by-the-client');
    const second = rollIn('chosen-by-the-client');
    assert.lengthOf(first, 30);
    // The method's stream would give these same dice twice
    assert.notDeepEqual(first, second);
    assert.isTrue(first.every(value => value >= 1 && value <= 20));
  });

  it('leave a log roll to the server: the client\'s simulation writes no line of its own dice', async function () {
    const creatureId = Random.id();
    const result = await (logRoll as any)._execute({ userId: Random.id(), isSimulation: true }, { roll: '1d20', creatureId });
    assert.isUndefined(result);
    assert.equal(await CreatureLogs.find({ creatureId }).countAsync(), 0);
  });
});
