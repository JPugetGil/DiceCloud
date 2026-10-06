import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import EngineActions, { EngineAction } from '/imports/api/engine/action/EngineActions';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { insertAction } from '/imports/api/engine/action/methods/insertAction';
import { drawDice } from '/imports/api/engine/action/methods/drawDice';
import {
  createTestCreature, getRandomIds, removeAllCreaturesAndProps, TestCreature,
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';

// The periodic job, on the server only (quave:synced-cron)
let abandonedActions: typeof import('/imports/api/engine/action/server/removeAbandonedActions');
if (Meteor.isServer) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  abandonedActions = require('/imports/api/engine/action/server/removeAbandonedActions');
}

/*
 * An action that no other replaced and that never ran is removed after a
 * while, and logged as abandoned if its dice were drawn: insertAction only
 * logged it when the creature's next action replaced it.
 */
if (Meteor.isServer) describe('Actions left in progress', function () {
  this.timeout(30000);

  const [ownerId, creatureId, attackId] = getRandomIds(3);
  const creature: TestCreature = {
    _id: creatureId,
    owner: ownerId,
    props: [{ _id: attackId, type: 'action', name: 'Longbow', attackRoll: { calculation: '5' } }],
  };
  const execute = (method: unknown, args: unknown): Promise<any> =>
    (method as { _execute(invocation: { userId: string }, args: unknown): Promise<any> })._execute({ userId: ownerId }, args);
  const HOUR = 60 * 60 * 1000;
  const abandonedLines = async () => (await CreatureLogs.find({
    creatureId, 'content.i18n.name.key': 'logs.actionAbandoned',
  }).fetchAsync()).map(log => log.content[0].name);

  /** An action in progress, as insertAction left it some time ago */
  async function leftAction({ insertedAt, revealedCursor }: { insertedAt?: Date, revealedCursor?: number }) {
    const _id = Random.id();
    await EngineActions.rawCollection().insertOne({
      _id,
      creatureId,
      task: { prop: await CreatureProperties.findOneAsync(attackId), targetIds: [] },
      results: [],
      taskCount: 0,
      seed: Random.secret(),
      ...insertedAt && { insertedAt },
      ...revealedCursor !== undefined && { revealedCursor },
    } as any);
    return _id;
  }

  before(async function () {
    await removeAllCreaturesAndProps();
    await Meteor.users.rawCollection().insertOne({
      _id: ownerId, createdAt: new Date(), username: `abandon-test-${ownerId}`,
    } as any);
    await createTestCreature(creature);
  });

  beforeEach(async function () {
    await EngineActions.removeAsync({});
    await CreatureLogs.removeAsync({ creatureId });
  });

  after(async function () {
    await EngineActions.removeAsync({ creatureId });
    await CreatureLogs.removeAsync({ creatureId });
    await Meteor.users.removeAsync(ownerId);
    await removeAllCreaturesAndProps();
  });

  it('dates an action when the server inserts it, whatever the client sent', async function () {
    const start = Date.now();
    const actionId = await execute(insertAction, {
      action: { creatureId, task: { prop: await CreatureProperties.findOneAsync(attackId), targetIds: [] }, results: [], taskCount: 0, insertedAt: new Date(0) },
    });
    const { insertedAt } = await EngineActions.findOneAsync(actionId) as EngineAction;
    assert.instanceOf(insertedAt, Date);
    assert.isAtLeast(insertedAt!.getTime(), start);
  });

  it('removes the old actions, logging those whose dice were drawn, and keeps the recent ones', async function () {
    const now = new Date();
    const drawn = await leftAction({ insertedAt: new Date(now.getTime() - 2 * HOUR), revealedCursor: 3 });
    const notDrawn = await leftAction({ insertedAt: new Date(now.getTime() - 2 * HOUR) });
    const undated = await leftAction({ revealedCursor: 1 });
    const recent = await leftAction({ insertedAt: new Date(now.getTime() - 10 * 60 * 1000), revealedCursor: 2 });
    const justOld = await leftAction({ insertedAt: new Date(now.getTime() - abandonedActions.ABANDONED_AFTER_MS - 1000) });

    await abandonedActions.removeAbandonedActions(now);

    const left = (await EngineActions.find({}).fetchAsync()).map(action => action._id);
    assert.deepEqual(left, [recent], 'only the recent action is left');
    for (const id of [drawn, notDrawn, undated, justOld]) assert.notInclude(left, id);
    // The two whose dice were drawn, the undated one counting as old
    assert.deepEqual(await abandonedLines(), [
      'Action abandoned after its dice were rolled: Longbow',
      'Action abandoned after its dice were rolled: Longbow',
    ]);
    // Nothing more to do on the next run
    await abandonedActions.removeAbandonedActions(now);
    assert.lengthOf(await abandonedLines(), 2);
  });

  it('logs an action whose die is drawn while the job removes it', async function () {
    const actionId = await leftAction({ insertedAt: new Date(Date.now() - 2 * HOUR) });
    // The job reads the action without dice; a die is drawn before it removes it
    const collection = EngineActions as any;
    const findOneAsync = collection.findOneAsync;
    let drawing = false;
    collection.findOneAsync = async function (...args: any[]) {
      const found = await findOneAsync.apply(this, args);
      if (!drawing && found?._id === actionId && found.revealedCursor === undefined) {
        drawing = true;
        await execute(drawDice, { actionId, cursor: 0, dice: [{ number: 1, diceSize: 20 }] });
      }
      return found;
    };
    try {
      await abandonedActions.removeAbandonedActions();
    } finally {
      collection.findOneAsync = findOneAsync;
    }
    assert.isTrue(drawing, 'the die was drawn in between');
    assert.isUndefined(await EngineActions.findOneAsync(actionId));
    assert.lengthOf(await abandonedLines(), 1, 'logged once, with the die it revealed');
  });
});
