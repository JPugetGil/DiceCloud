import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { DDP } from 'meteor/ddp';
import { Mongo } from 'meteor/mongo';
import { Accounts } from 'meteor/accounts-base';
import { Random } from 'meteor/random';
import EngineActions, { EngineAction } from '/imports/api/engine/action/EngineActions';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import { insertAction } from '/imports/api/engine/action/methods/insertAction';
import { drawDice } from '/imports/api/engine/action/methods/drawDice';
import { runAction } from '/imports/api/engine/action/methods/runAction';
import applyAction from '/imports/api/engine/action/functions/applyAction';
import getServerDiceRoller from '/imports/api/engine/action/functions/userInput/getServerDiceRoller';
import { drawDiceAt } from '/imports/api/engine/action/functions/userInput/getDeterministicDiceRoller';
import inputProviderForTests from '/imports/api/engine/action/functions/userInput/inputProviderForTests.testFn';
import {
  allLogContent, createTestCreature, getRandomIds, removeAllCreaturesAndProps, TestCreature,
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';

// The server's dice: node:crypto, which the client's bundle of the tests has not
let actionDice: typeof import('/imports/api/engine/action/functions/userInput/server/actionDice');
let createHmac: typeof import('node:crypto').createHmac;
if (Meteor.isServer) {
  // Unit tests load no entry point: the publications register here
  /* eslint-disable @typescript-eslint/no-require-imports */
  require('/imports/api/creature/creatures/server/publications/singleCharacter');
  require('/imports/api/creature/creatureFolders/server/publications/partyBoard');
  actionDice = require('/imports/api/engine/action/functions/userInput/server/actionDice');
  ({ createHmac } = require('node:crypto'));
  /* eslint-enable @typescript-eslint/no-require-imports */
}
// The dice a seed gives from a position on (HMAC-SHA256)
const drawSeededDiceAt = (seed: string, cursor: number, dice: { number: number, diceSize: number }[]) =>
  actionDice.drawSeededDiceAt(seed, cursor, dice);

/*
 * The dice of an action come from a seed only the server knows: the client
 * draws them by position (drawDice) while it plays the action, and runAction
 * replays them from the seed. A client that knew the seed could play the
 * action in advance and insert it again until the dice suited it.
 */
if (Meteor.isServer) describe('Action dice: a secret seed, drawn by the server', function () {
  this.timeout(30000);

  const [ownerId, strangerId, creatureId, attackId, damageId, hitPointsId, folderId, surgeId] = getRandomIds(8);
  const userIds = [ownerId, strangerId];
  const creature: TestCreature = {
    _id: creatureId,
    owner: ownerId,
    props: [
      // An attack whose damage hits its own creature: the dice change the sheet
      {
        _id: attackId,
        type: 'action',
        name: 'Firebolt',
        attackRoll: { calculation: '5' },
        children: [{
          _id: damageId,
          type: 'damage',
          target: 'self',
          damageType: 'fire',
          amount: { calculation: '4d10 + 3' },
        }],
      },
      {
        _id: hitPointsId,
        type: 'attribute',
        name: 'Hit Points',
        attributeType: 'healthBar',
        variableName: 'hitPoints',
        baseValue: { calculation: '200' },
      },
      // Dice that functions roll: every d6 rerolled once, every d6 exploded once
      {
        _id: surgeId,
        type: 'action',
        name: 'Wild surge',
        children: [{
          type: 'roll',
          name: 'Rerolled',
          variableName: 'rerolled',
          roll: { calculation: 'reroll(20d6, 6, true)' },
        }, {
          type: 'roll',
          name: 'Exploded',
          variableName: 'exploded',
          roll: { calculation: 'explode(20d6, 1, 1)' },
        }],
      },
    ],
  };

  // A method run as a user, as the server runs it (mdg:validated-method's _execute)
  const execute = (method: unknown, userId: string, args: unknown): Promise<any> =>
    (method as { _execute(invocation: { userId: string }, args: unknown): Promise<any> })._execute({ userId }, args);
  const attackTask = async () => ({ prop: await CreatureProperties.findOneAsync(attackId), targetIds: [] });
  const newAction = async (extra: Record<string, unknown> = {}) => execute(insertAction, ownerId, {
    action: { creatureId, task: await attackTask(), results: [], taskCount: 0, ...extra },
  }) as Promise<string>;
  const draw = (actionId: string, cursor: number, dice: { number: number, diceSize: number }[], userId = ownerId) =>
    execute(drawDice, userId, { actionId, cursor, dice }) as Promise<number[][]>;
  const abandonedLines = () => CreatureLogs.find({
    creatureId, 'content.i18n.name.key': 'logs.actionAbandoned',
  }).fetchAsync();

  /**
   * Plays an action as the client does (doAction, ActionDialog): its dice
   * from the server, the user's choices recorded as decisions
   */
  async function playOnClient(actionId: string) {
    const action = await EngineActions.findOneAsync(actionId) as EngineAction;
    // The client never has the seed
    delete action.seed;
    const rollDice = getServerDiceRoller(actionId, args => draw(args.actionId, args.cursor, args.dice));
    await applyAction(action, { ...inputProviderForTests, rollDice }, { simulate: true });
    return action;
  }

  before(async function () {
    await removeAllCreaturesAndProps();
    await Meteor.users.rawCollection().insertMany(userIds.map((_id, i) => ({
      _id, createdAt: new Date(), username: `dice-test-${i}-${_id}`,
    })) as any[]);
    await createTestCreature(creature);
    await CreatureFolders.rawCollection().insertOne({
      _id: folderId, name: 'The table', owner: ownerId, creatures: [creatureId], members: [], order: 0,
    } as any);
  });

  after(async function () {
    await EngineActions.removeAsync({ creatureId });
    await CreatureLogs.removeAsync({ creatureId });
    await CreatureFolders.removeAsync(folderId);
    await Meteor.users.removeAsync({ _id: { $in: userIds } });
    await removeAllCreaturesAndProps();
  });

  it('gives an action a secret seed of its own, which is not its id and which the client cannot choose', async function () {
    const actionId = await newAction({ seed: 'chosen-by-the-client', revealedCursor: 0 });
    assert.isString(actionId, 'insertAction returns the id alone');
    const { seed, revealedCursor } = await EngineActions.findOneAsync(actionId) as EngineAction;
    assert.isString(seed);
    assert.notEqual(seed, actionId);
    assert.notEqual(seed, 'chosen-by-the-client');
    assert.isAtLeast(seed!.length, 40, '256 bits from Random.secret');
    assert.isUndefined(revealedCursor);
    const other = await EngineActions.findOneAsync(await newAction()) as EngineAction;
    assert.notEqual(other.seed, seed);
  });

  it('draws the same dice at the same position, the seed\'s sequence, and records how far it revealed', async function () {
    const actionId = await newAction();
    const { seed } = await EngineActions.findOneAsync(actionId) as EngineAction;
    const d20 = await draw(actionId, 0, [{ number: 1, diceSize: 20 }]);
    assert.deepEqual(await draw(actionId, 0, [{ number: 1, diceSize: 20 }]), d20, 'idempotent');
    const twoD6 = await draw(actionId, 1, [{ number: 2, diceSize: 6 }]);
    // The same values whether drawn one roll at a time or all at once
    assert.deepEqual(
      await draw(actionId, 0, [{ number: 1, diceSize: 20 }, { number: 2, diceSize: 6 }]), [d20[0], twoD6[0]],
    );
    // Exactly what runAction's roller gives, from the start
    const roller = actionDice.getActionDiceRoller({ _id: actionId, seed });
    assert.deepEqual([...await roller([{ number: 1, diceSize: 20 }]), ...await roller([{ number: 2, diceSize: 6 }])],
      [d20[0], twoD6[0]]);
    assert.deepEqual(drawSeededDiceAt(seed!, 1, [{ number: 2, diceSize: 6 }]), twoD6);
    assert.equal((await EngineActions.findOneAsync(actionId))?.revealedCursor, 3);
    // Going back does not lower it
    await draw(actionId, 0, [{ number: 1, diceSize: 20 }]);
    assert.equal((await EngineActions.findOneAsync(actionId))?.revealedCursor, 3);
  });

  it('refuses dice to someone who may not edit the character, and impossible requests', async function () {
    const actionId = await newAction();
    let error: any;
    try {
      await draw(actionId, 0, [{ number: 1, diceSize: 20 }], strangerId);
    } catch (e) {
      error = e;
    }
    assert.match(error?.error, /permission denied/i);
    assert.isUndefined((await EngineActions.findOneAsync(actionId))?.revealedCursor, 'nothing revealed');
    for (const [cursor, dice] of [
      [-1, [{ number: 1, diceSize: 20 }]],
      [1e9, [{ number: 1, diceSize: 20 }]],
      [0, [{ number: 101, diceSize: 20 }]],
      [0, []],
    ] as const) {
      let refused = false;
      try {
        await draw(actionId, cursor, dice as any);
      } catch {
        refused = true;
      }
      assert.isTrue(refused, `cursor ${cursor}, ${JSON.stringify(dice)}`);
    }
    let missing: any;
    try {
      await draw(Random.id(), 0, [{ number: 1, diceSize: 20 }]);
    } catch (e) {
      missing = e;
    }
    assert.equal(missing?.error, 'not-found');
  });

  it('replays in runAction the very dice the client drew, whatever dice the client sends back', async function () {
    const actionId = await newAction();
    const played = await playOnClient(actionId);
    const shown = allLogContent(played).map(({ name, value }) => ({ name, value }));
    // The attack's d20 and the damage's 4d10 (8d10 on a critical hit), drawn
    // one roll at a time: the decisions of rollDice
    const dice = played._decisions?.filter(Array.isArray) as number[][][];
    assert.lengthOf(dice, 2);
    const d20 = dice[0][0][0];
    const damageDice = dice[1][0];
    assert.lengthOf(damageDice, d20 === 20 ? 8 : 4);
    const { seed } = await EngineActions.findOneAsync(actionId) as EngineAction;
    assert.deepEqual(dice, [
      drawSeededDiceAt(seed!, 0, [{ number: 1, diceSize: 20 }]),
      drawSeededDiceAt(seed!, 1, [{ number: damageDice.length, diceSize: 10 }]),
    ]);
    // A client that changes the dice it sends back gains nothing
    const decisions = played._decisions!.map(decision => Array.isArray(decision) ? decision.map(roll => roll.map(() => 20)) : decision);

    await execute(runAction, ownerId, { actionId, decisions });
    const log = await CreatureLogs.findOneAsync({ creatureId, actionId });
    assert.exists(log, 'the server logged the action');
    assert.deepEqual(log!.content.map(({ name, value }: any) => ({ name, value })), shown);
    assert.include(log!.content.map((line: any) => line.value).join('\n'), `1d20 [${d20}]`);
    // The damage dealt is the one shown
    const damage = damageDice.reduce((total, value) => total + value, 3);
    const hitPoints = await CreatureProperties.findOneAsync(hitPointsId);
    assert.equal(hitPoints?.damage, damage);
    assert.isUndefined(await EngineActions.findOneAsync(actionId), 'the action is done');
  });

  it('rolls the dice of reroll() and explode() as the action\'s: the same on the client and in runAction, whatever the call\'s random seed', async function () {
    const actionId = await newAction({
      task: { prop: await CreatureProperties.findOneAsync(surgeId), targetIds: [] },
    });
    const played = await playOnClient(actionId);
    const shown = allLogContent(played).map(({ name, value }) => ({ name, value }));
    // 20d6, then their 20 new rolls at once; 20d6, then their 20 explosions
    const dice = played._decisions?.filter(Array.isArray) as number[][][];
    assert.deepEqual(dice.map(roll => roll[0].length), [20, 20, 20, 20]);
    // The action's sequence, drawn by the server
    const { seed } = await EngineActions.findOneAsync(actionId) as EngineAction;
    assert.deepEqual(dice.flat(2), drawSeededDiceAt(seed!, 0, [{ number: 80, diceSize: 6 }])[0]);
    assert.equal((await EngineActions.findOneAsync(actionId))?.revealedCursor, 80);

    // runAction called with a random seed the client chose: the method's
    // random stream follows it, the action's dice do not
    const invocation = { randomSeed: 'chosen-by-the-client', userId: ownerId, isSimulation: false };
    await (DDP as any)._CurrentMethodInvocation.withValue(invocation, () => execute(runAction, ownerId, {
      actionId, decisions: played._decisions,
    }));
    const log = await CreatureLogs.findOneAsync({ creatureId, actionId });
    assert.exists(log, 'the server logged the action');
    assert.deepEqual(log!.content.map(({ name, value }: any) => ({ name, value })), shown);
    assert.include(log!.content.map((line: any) => line.value).join('\n'), `[~~${dice[0][0][0]}~~, ${dice[1][0][0]},`);
  });

  it('waits out drawDice\'s rate limit on the client, rather than fail the action', async function () {
    const calls: number[] = [];
    let limited = 2;
    const roller = getServerDiceRoller(Random.id(), async ({ cursor }) => {
      calls.push(cursor);
      // As DDPRateLimiter refuses a call: the wait in milliseconds in its details
      if (limited-- > 0) throw Object.assign(new Meteor.Error('too-many-requests', 'Error, too many requests'), {
        details: { timeToReset: 20 },
      });
      return [[4]];
    });
    assert.deepEqual(await roller([{ number: 1, diceSize: 6 }]), [[4]]);
    assert.deepEqual(calls, [0, 0, 0], 'asked again after each wait');
    // Any other error is the action's
    const failing = getServerDiceRoller(Random.id(), async () => {
      throw new Meteor.Error('not-found', 'Action not found');
    });
    let error: any;
    try {
      await failing([{ number: 1, diceSize: 6 }]);
    } catch (e) {
      error = e;
    }
    assert.equal(error?.error, 'not-found');
  });

  it('logs an action abandoned after its dice were drawn, and none abandoned before', async function () {
    await EngineActions.removeAsync({ creatureId });
    await CreatureLogs.removeAsync({ creatureId });
    // Replaced before any die: an ordinary cancel
    await newAction();
    const drawn = await newAction();
    assert.lengthOf(await abandonedLines(), 0);
    // Replaced once its d20 is known
    await draw(drawn, 0, [{ number: 1, diceSize: 20 }]);
    await newAction();
    const lines = await abandonedLines();
    assert.lengthOf(lines, 1);
    const [line] = lines[0].content;
    assert.equal(line.name, 'Action abandoned after its dice were rolled: Firebolt');
    assert.deepEqual(line.i18n, { name: { key: 'logs.actionAbandoned', params: { name: 'Firebolt' } } });
    // A die drawn once the action is gone reveals nothing
    let error: any;
    try {
      await draw(drawn, 1, [{ number: 1, diceSize: 20 }]);
    } catch (e) {
      error = e;
    }
    assert.equal(error?.error, 'not-found');
    // An action that ran is not abandoned
    const ran = await newAction();
    await execute(runAction, ownerId, { actionId: ran, decisions: (await playOnClient(ran))._decisions });
    await newAction();
    assert.lengthOf(await abandonedLines(), 1);
  });

  it('rolls an action inserted before seeds existed from its id, as before', async function () {
    const actionId = Random.id();
    await EngineActions.rawCollection().insertOne({
      _id: actionId, creatureId, task: await attackTask(), results: [], taskCount: 0,
    } as any);
    assert.deepEqual(await draw(actionId, 0, [{ number: 1, diceSize: 20 }]), drawDiceAt(actionId, 0, [{ number: 1, diceSize: 20 }]));
    const played = await playOnClient(actionId);
    const shown = allLogContent(played).map(({ name, value }) => ({ name, value }));
    await execute(runAction, ownerId, { actionId, decisions: played._decisions });
    const log = await CreatureLogs.findOneAsync({ creatureId, actionId });
    assert.deepEqual(log!.content.map(({ name, value }: any) => ({ name, value })), shown);
  });

  it('never sends the seed to a client: not by insertAction, the sheet, nor the party board', async function () {
    const connection = DDP.connect(Meteor.absoluteUrl());
    // Every DDP message the client receives
    const frames: string[] = [];
    (connection as any)._stream.on('message', (message: string) => frames.push(message));
    try {
      const accounts = Accounts as any;
      const stamped = accounts._generateStampedLoginToken();
      await accounts._insertLoginToken(ownerId, stamped);
      await connection.callAsync('login', { resume: stamped.token });
      const subscribe = (name: string, ...args: any[]) => new Promise((resolve, reject) => connection.subscribe(name, ...args, {
        onReady: resolve,
        onStop: (error: unknown) => error && reject(error),
      }));
      await subscribe('singleCharacter', creatureId);
      await subscribe('partyBoard', folderId);
      const actions = new Mongo.Collection<any>('actions', { connection });

      const actionId = await connection.callAsync('actions.insertAction', {
        action: { creatureId, task: await attackTask(), results: [], taskCount: 0 },
      });
      const [values] = await connection.callAsync('actions.drawDice', {
        actionId, cursor: 0, dice: [{ number: 1, diceSize: 20 }],
      }) as number[][];
      const { seed } = await EngineActions.findOneAsync(actionId) as EngineAction;
      assert.isString(seed);
      assert.deepEqual(values, drawSeededDiceAt(seed!, 0, [{ number: 1, diceSize: 20 }])[0]);
      // The client's copy of the action, once the server's update has arrived
      for (let i = 0; i < 50 && (await actions.findOneAsync(actionId))?.revealedCursor !== 1; i += 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const copy = await actions.findOneAsync(actionId);
      assert.exists(copy, 'the client has the action');
      assert.equal(copy.revealedCursor, 1);
      assert.notProperty(copy, 'seed');
      assert.isTrue(frames.some(frame => frame.includes(actionId)), 'the frames were recorded');
      assert.isFalse(frames.some(frame => frame.includes(seed!)), 'no frame holds the seed');
    } finally {
      connection.disconnect();
    }
  });
});

/*
 * Die number `position` of an action with a seed is HMAC-SHA256(seed,
 * position), brought down to 1..faces by rejection: no die can be told from
 * the others without the seed, and each is computed on its own.
 */
if (Meteor.isServer) describe('Action dice: HMAC-SHA256 of the seed and the position', function () {
  const seed = 'a secret seed, as Random.secret() draws one';

  it('is the HMAC of the seed and the position, read as a 64-bit number', function () {
    for (let position = 0; position < 50; position += 1) {
      const word = createHmac('sha256', seed).update(String(position)).digest().readBigUInt64BE(0);
      // The first word is kept but once in 10^18 times for a d20
      assert.equal(actionDice.seededDie(seed, position, 20), Number(word % BigInt(20)) + 1, `position ${position}`);
    }
  });

  it('gives the same die for the same seed and position, any position directly', function () {
    const sequence = drawSeededDiceAt(seed, 0, [{ number: 100, diceSize: 12 }])[0];
    assert.deepEqual(drawSeededDiceAt(seed, 0, [{ number: 100, diceSize: 12 }])[0], sequence);
    assert.deepEqual(drawSeededDiceAt(seed, 40, [{ number: 3, diceSize: 12 }, { number: 2, diceSize: 12 }]),
      [sequence.slice(40, 43), sequence.slice(43, 45)]);
    // A far position, without the dice before it
    assert.equal(drawSeededDiceAt(seed, 99999, [{ number: 1, diceSize: 12 }])[0][0], actionDice.seededDie(seed, 99999, 12));
    assert.notDeepEqual(drawSeededDiceAt('another seed', 0, [{ number: 100, diceSize: 12 }])[0], sequence);
  });

  it('rolls every face of a d20 about as often (chi-square over 6000 dice)', function () {
    const counts = new Array(20).fill(0);
    for (const value of drawSeededDiceAt(seed, 0, Array.from({ length: 60 }, () => ({ number: 100, diceSize: 20 }))).flat()) {
      counts[value - 1] += 1;
    }
    const expected = 6000 / 20;
    const chiSquare = counts.reduce((total, count) => total + (count - expected) ** 2 / expected, 0);
    // 19 degrees of freedom: a fair die stays under 43.8 999 times in 1000
    assert.isBelow(chiSquare, 43.8, JSON.stringify(counts));
    assert.isTrue(counts.every(count => count > 0));
  });

  it('rolls any number of faces the engine allows, and 1 for a die without two', function () {
    for (const faces of [2, 3, 100, 2 ** 32 + 1, Number.MAX_SAFE_INTEGER]) {
      for (let position = 0; position < 20; position += 1) {
        const value = actionDice.seededDie(seed, position, faces);
        assert.isTrue(Number.isInteger(value) && value >= 1 && value <= faces, `d${faces}: ${value}`);
      }
    }
    assert.deepEqual([1, 0, -6].map(faces => actionDice.seededDie(seed, 0, faces)), [1, 1, 1]);
    // Each die takes its position, whatever its faces
    assert.deepEqual(drawSeededDiceAt(seed, 0, [{ number: 2, diceSize: 1 }, { number: 1, diceSize: 20 }])[1],
      [actionDice.seededDie(seed, 2, 20)]);
  });

  it('rolls an action without a seed from its id, with Alea, as before', async function () {
    const roller = actionDice.getActionDiceRoller({ _id: 'an action id' });
    assert.deepEqual(await roller([{ number: 3, diceSize: 20 }]), drawDiceAt('an action id', 0, [{ number: 3, diceSize: 20 }]));
    assert.deepEqual(actionDice.drawActionDiceAt({ _id: 'an action id' }, 3, [{ number: 1, diceSize: 6 }]),
      drawDiceAt('an action id', 3, [{ number: 1, diceSize: 6 }]));
  });
});
