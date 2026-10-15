import { ValidatedMethod } from 'meteor/mdg:validated-method';
import EngineActions from '/imports/api/engine/action/EngineActions';
import { assertEditPermission } from '/imports/api/sharing/sharingPermissions';
import { getCreature } from '/imports/api/engine/loadCreatures';
import applyAction from '/imports/api/engine/action/functions/applyAction';
import writeActionResults from '../functions/writeActionResults';
import assertMayTarget from '/imports/api/engine/action/functions/assertMayTarget';
import getReplayChoicesInputProvider from '/imports/api/engine/action/functions/userInput/getReplayChoicesInputProvider';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import getDeterministicDiceRoller from '/imports/api/engine/action/functions/userInput/getDeterministicDiceRoller';
import { DECISION_KINDS, type Decision } from '/imports/api/engine/action/functions/userInput/saveInputChoices';

let getActionDiceRoller: typeof import('/imports/api/engine/action/functions/userInput/server/actionDice').getActionDiceRoller;
let getHiddenDiceRoller: typeof import('/imports/api/engine/action/functions/userInput/server/actionDice').getHiddenDiceRoller;
if (Meteor.isServer) {
  // require(), not import: the client calls this method, and a static import
  // would bundle node:crypto into it
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ({ getActionDiceRoller, getHiddenDiceRoller } = require('/imports/api/engine/action/functions/userInput/server/actionDice'));
}

export const runAction = new ValidatedMethod({
  name: 'actions.runAction',
  // The decisions replay the user's inputs, each kind in its order: dice
  // results (which only the browser's simulation of this method replays),
  // choices, advantage and check parameters. Their values are checked as
  // they are replayed (getReplayChoicesInputProvider)
  validate({ actionId, decisions }: { actionId: string, decisions?: Decision[] }) {
    check(actionId, String);
    check(decisions, Match.Maybe([{ kind: Match.OneOf(...DECISION_KINDS), value: Match.Any }]));
  },
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 10,
    timeInterval: 5000,
  },
  run: async function ({ actionId, decisions = [] }: { actionId: string, decisions?: Decision[] }) {
    // Get the action
    const action = await EngineActions.findOneAsync(actionId);
    if (!action) throw new Meteor.Error('not-found', 'Action not found');

    // Permissions
    const creature = await getCreature(action.creatureId);
    await assertEditPermission(creature, this.userId);
    // The targets again, as insertAction checked them: since then, the user
    // may have left the party, or the game master removed them from it. On
    // the server only, as there
    if (!this.isSimulation) {
      for (const targetId of action.task.targetIds || []) {
        await assertMayTarget(creature, await getCreature(targetId), this.userId, action.task);
      }
    }

    // Replay the user's decisions as user input, and the dice from the
    // action's secret seed: the dice the server gave the client (drawDice),
    // in the same order. An action inserted before actions had a seed rolls
    // from its id, as it did. The client's simulation has no seed: it shows
    // the dice it was given until the server's results replace them. The
    // server alone rolls for a target hidden from the actor's readers, a
    // stream of the seed the client never draws; without it, the client's
    // simulation leaves what such a target does to the server, as its dialog
    // did (hiddenStats.ts)
    const rollDice = this.isSimulation
      ? getDeterministicDiceRoller(actionId)
      : getActionDiceRoller({ _id: actionId, seed: action.seed });
    const userInput = getReplayChoicesInputProvider(action, rollDice, decisions, {
      replayDice: !!this.isSimulation,
      ...!this.isSimulation && { rollHiddenDice: getHiddenDiceRoller({ _id: actionId, seed: action.seed }) },
    });

    // Apply the action, from no results: whatever the stored action holds is
    // not trusted (insertAction empties them too)
    action.results = [];
    await applyAction(action, userInput);

    // Persist changes
    return await writeActionResults(action);
  },
});
