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
import getDeterministicDiceRoller, { drawDiceAt } from '/imports/api/engine/action/functions/userInput/getDeterministicDiceRoller';
import inputProviderForTests from '/imports/api/engine/action/functions/userInput/inputProviderForTests.testFn';
import {
  allLogContent, createTestCreature, getRandomIds, removeAllCreaturesAndProps, TestCreature,
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';

if (Meteor.isServer) {
  // Unit tests load no entry point: the publications register here
  /* eslint-disable @typescript-eslint/no-require-imports */
  require('/imports/api/creature/creatures/server/publications/singleCharacter');
  require('/imports/api/creature/creatureFolders/server/publications/partyBoard');
  /* eslint-enable @typescript-eslint/no-require-imports */
}

/*
 * The dice of an action come from a seed only the server knows: the client
 * draws them by position (drawDice) while it plays the action, and runAction
 * replays them from the seed. A client that knew the seed could play the
 * action in advance and insert it again until the dice suited it.
 */
if (Meteor.isServer) describe('Action dice: a secret seed, drawn by the server', function () {
  this.timeout(30000);

  const [ownerId, strangerId, creatureId, attackId, damageId, hitPointsId, folderId] = getRandomIds(7);
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
    const roller = getDeterministicDiceRoller(seed!);
    assert.deepEqual([...await roller([{ number: 1, diceSize: 20 }]), ...await roller([{ number: 2, diceSize: 6 }])],
      [d20[0], twoD6[0]]);
    assert.deepEqual(drawDiceAt(seed!, 1, [{ number: 2, diceSize: 6 }]), twoD6);
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
      drawDiceAt(seed!, 0, [{ number: 1, diceSize: 20 }]),
      drawDiceAt(seed!, 1, [{ number: damageDice.length, diceSize: 10 }]),
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
      assert.deepEqual(values, drawDiceAt(seed!, 0, [{ number: 1, diceSize: 20 }])[0]);
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
