import { ValidatedMethod } from 'meteor/mdg:validated-method';
import EngineActions from '/imports/api/engine/action/EngineActions';
import { assertEditPermission } from '/imports/api/sharing/sharingPermissions';
import { getCreature } from '/imports/api/engine/loadCreatures';
import applyAction from '/imports/api/engine/action/functions/applyAction';
import writeActionResults from '../functions/writeActionResults';
import getReplayChoicesInputProvider from '/imports/api/engine/action/functions/userInput/getReplayChoicesInputProvider';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';

export const runAction = new ValidatedMethod({
  name: 'actions.runAction',
  // The decisions replay the user's inputs in order: dice results, choices,
  // advantage and check parameters, so only their container is checked here
  validate({ actionId, decisions }: { actionId: string, decisions?: any[] }) {
    check(actionId, String);
    check(decisions, Match.Maybe([Match.Any]));
  },
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 10,
    timeInterval: 5000,
  },
  run: async function ({ actionId, decisions = [] }: { actionId: string, decisions?: any[] }) {
    // Get the action
    const action = await EngineActions.findOneAsync(actionId);
    if (!action) throw new Meteor.Error('not-found', 'Action not found');

    // Permissions
    await assertEditPermission(await getCreature(action.creatureId), this.userId);

    // Replay the user's decisions as user input, and the dice from the
    // action's secret seed: the dice the server gave the client (drawDice),
    // in the same order. An action inserted before actions had a seed rolls
    // from its id, as it did. The client's simulation has no seed: it shows
    // the dice it was given until the server's results replace them
    const userInput = getReplayChoicesInputProvider(action.seed ?? actionId, decisions, {
      replayDice: !!this.isSimulation,
    });

    // Apply the action
    await applyAction(action, userInput);

    // Persist changes
    return await writeActionResults(action);
  },
});
