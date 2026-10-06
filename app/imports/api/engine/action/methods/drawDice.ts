import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { check, Match } from 'meteor/check';
import { Meteor } from 'meteor/meteor';
import EngineActions from '/imports/api/engine/action/EngineActions';
import { assertEditPermission } from '/imports/api/sharing/sharingPermissions';
import { getCreature } from '/imports/api/engine/loadCreatures';
import { diceCount, drawDiceAt, type DiceRequest } from '/imports/api/engine/action/functions/userInput/getDeterministicDiceRoller';

// The furthest an action's dice can go: far beyond any real action (100
// properties at most), and short enough to replay on every call
export const MAX_DICE_CURSOR = 100000;
// The engine asks for one roll at a time; a roll is at most 100 dice
const MAX_ROLLS_PER_CALL = 10;
const MAX_DICE_PER_ROLL = 100;

/**
 * The dice of an action in progress, by position: the `cursor`-th value of the
 * action's sequence onwards, from its seed, which only the server knows. The
 * client asks for each roll as the engine needs it (getServerDiceRoller); the
 * same position always gives the same dice, so the client can simulate the
 * action again from the start (ActionDialog after doAction), and runAction,
 * replaying the whole sequence from the seed, rolls exactly the same dice.
 *
 * Records how far the dice have been revealed: an action replaced before it
 * ran, after its dice were seen, is logged as abandoned (insertAction).
 */
export const drawDice = new ValidatedMethod({
  name: 'actions.drawDice',
  validate({ actionId, cursor, dice }: { actionId: string, cursor: number, dice: DiceRequest }) {
    check(actionId, String);
    check(cursor, Match.Where(value => Number.isInteger(value) && value >= 0 && value <= MAX_DICE_CURSOR));
    check(dice, [{
      number: Match.Where(value => Number.isInteger(value) && value >= 0 && value <= MAX_DICE_PER_ROLL),
      diceSize: Match.Where(value => Number.isSafeInteger(value)),
    }]);
    if (!dice.length || dice.length > MAX_ROLLS_PER_CALL) {
      throw new Meteor.Error('validation-error', `Draw between 1 and ${MAX_ROLLS_PER_CALL} rolls at once`);
    }
    if (cursor + diceCount(dice) > MAX_DICE_CURSOR) {
      throw new Meteor.Error('Too many dice', 'This action has rolled too many dice');
    }
  },
  mixins: [RateLimiterMixin],
  rateLimit: {
    // An action rolls a few dice at once, one call per roll, and a spell with
    // many saving throws a few more: 50 per 5 seconds leaves room for both
    numRequests: 50,
    timeInterval: 5000,
  },
  run: async function ({ actionId, cursor, dice }: { actionId: string, cursor: number, dice: DiceRequest }) {
    // The client has no seed: its simulation of this method does nothing, and
    // the result is the server's
    if (this.isSimulation) return;

    const action = await EngineActions.findOneAsync(actionId, { fields: { creatureId: 1, seed: 1 } });
    if (!action) throw new Meteor.Error('not-found', 'Action not found');
    await assertEditPermission(await getCreature(action.creatureId), this.userId);

    // An action inserted before actions had a seed rolls from its id, as it did
    const values = drawDiceAt(action.seed ?? actionId, cursor, dice);

    // Record the dice as revealed before revealing them. If the action has
    // gone (another action replaced it), nothing is revealed
    const updated = await EngineActions.updateAsync(
      { _id: actionId }, { $max: { revealedCursor: cursor + diceCount(dice) } },
    );
    if (!updated) throw new Meteor.Error('not-found', 'Action not found');
    return values;
  },
});
