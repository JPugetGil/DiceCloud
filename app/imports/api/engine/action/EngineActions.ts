import SimpleSchema from 'meteor/aldeed:simple-schema';
import TaskResult from './tasks/TaskResult';
import LogContentSchema from '/imports/api/creature/log/LogContentSchema';
import Task from './tasks/Task';
import { Mongo } from 'meteor/mongo';

const EngineActions = new Mongo.Collection<EngineAction>('actions');

export interface EngineAction {
  _id?: string;
  _isSimulation?: boolean;
  _stepThrough?: boolean;
  _decisions?: any[],
  task: Task;
  creatureId: string;
  results: TaskResult[];
  taskCount: number;
  // The secret its dice come from, on the server only: see ACTION_SEED_FIELD
  seed?: string;
  // How many dice the server has revealed to the client (drawDice)
  revealedCursor?: number;
}

/*
 * An action's dice come from a seed that only the server knows: insertAction
 * draws it, the client asks the server for its dice one roll at a time
 * (drawDice), and runAction replays them from the seed. A client that knew
 * the seed could play the action in advance and insert it again until the
 * dice suited it. The seed is a top-level field because Meteor's mergebox
 * merges a document's fields from all of a client's subscriptions by
 * top-level field: every publication of actions leaves it out, with
 * WITHOUT_SEED.
 */
export const ACTION_SEED_FIELD = 'seed';

/** A projection that leaves an action's seed out (and keeps every other field) */
export const WITHOUT_SEED = { [ACTION_SEED_FIELD]: 0 } as const;

const ActionSchema = new SimpleSchema({
  creatureId: {
    type: String,
    max: 32,
    // @ts-expect-error index not defined
    index: 1,
  },
  rootPropId: {
    type: String,
    max: 32,
    optional: true,
  },
  task: {
    type: Object,
    blackbox: true,
  },
  // Server only, never published: what the client sends is replaced
  seed: {
    type: String,
    max: 64,
    optional: true,
  },
  // The number of dice values the server has revealed: an action abandoned
  // after its dice were drawn is logged (insertAction)
  revealedCursor: {
    type: SimpleSchema.Integer,
    min: 0,
    optional: true,
  },
  // Applied properties
  results: {
    type: Array,
    defaultValue: [],
  },
  'results.$': {
    type: Object,
  },
  // The property and target ids popped off the task stack
  // Pushing these to the top of the stack and deleting the results from this point onwards
  // Should re-run the action identically from this point
  'results.$.propId': {
    type: String,
    max: 32,
  },
  'results.$.targetIds': {
    type: Array,
    defaultValue: [],
  },
  'results.$.targetIds.$': {
    type: String,
    max: 32,
  },
  // Changes that override the local scope
  'results.$.scope': {
    type: Object,
    optional: true,
    blackbox: true,
  },
  // Changes that consume pushed values from the local scope
  'results.$.popScope': {
    type: Object,
    optional: true,
    blackbox: true,
  },
  // Changes that push values to the local scope
  'results.$.pushScope': {
    type: Object,
    optional: true,
    blackbox: true,
  },
  // database changes
  'results.$.mutations': {
    type: Array,
    optional: true,
  },
  'results.$.mutations.$': {
    type: Object,
  },
  'results.$.mutations.$.targetIds': {
    type: Array,
  },
  'results.$.mutations.$.targetIds.$': {
    type: String,
    max: 32,
  },
  'results.$.mutations.$.updates': {
    type: Array,
    optional: true,
  },
  'results.$.mutations.$.updates.$': {
    type: Object,
  },
  'results.$.mutations.$.updates.$.propId': {
    type: String,
    max: 32,
  },
  // Required, because CreatureProperties.update requires a selector of { type }
  'results.$.mutations.$.updates.$.type': {
    type: String,
  },
  'results.$.mutations.$.updates.$.set': {
    type: Object,
    optional: true,
    blackbox: true,
  },
  'results.$.mutations.$.updates.$.inc': {
    type: Object,
    optional: true,
    blackbox: true,
  },
  'results.$.mutations.$.contents': {
    type: Array,
    optional: true,
  },
  'results.$.mutations.$.contents.$': {
    type: LogContentSchema,
  },
});

EngineActions.attachSchema(ActionSchema);

export default EngineActions;
export { ActionSchema }
