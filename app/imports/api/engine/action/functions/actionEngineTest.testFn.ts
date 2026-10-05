import '/imports/api/simpleSchemaConfig.js';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import propsFromForest, { ForestProp } from '/imports/api/engine/computation/utility/propsFromForest.testFn';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import computeCreature from '/imports/api/engine/computeCreature';
import { loadCreature, loadedCreatures, unloadAllCreatures } from '/imports/api/engine/loadCreatures';
import EngineActions, { EngineAction } from '/imports/api/engine/action/EngineActions';
import applyAction from '/imports/api/engine/action/functions/applyAction';
import { LogContent, Mutation, Update } from '/imports/api/engine/action/tasks/TaskResult';
import inputProvider from './userInput/inputProviderForTests.testFn';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { Tracker } from 'meteor/tracker';
/**
 * Removes all creatures, properties, and creatureVariable documents from the database
 */
export async function removeAllCreaturesAndProps() {
  if (Meteor.isServer) {
    await unloadAllCreatures();
    return Promise.all([
      CreatureProperties.removeAsync({}),
      Creatures.removeAsync({}),
      CreatureVariables.removeAsync({}),
    ]);
  } else {
    await CreatureProperties.find({}).forEachAsync(async doc => await CreatureProperties.removeAsync(doc._id));
    await Creatures.find({}).forEachAsync(async doc => await Creatures.removeAsync(doc._id));
    await CreatureVariables.find({}).forEachAsync(async (doc: any) => await CreatureVariables.removeAsync(doc._id));
  }
}

/**
 * Creates a test creature with all its props computed and loaded into memory
 * You may need to set the timeout of a test higher for this function to conclude
 * as it is inserting and reading potentially many database documents
 */
export async function createTestCreature(creature: TestCreature) {
  const dummySubscription = Tracker.autorun(() => undefined)
  await Creatures.insertAsync({
    _id: creature._id,
    name: creature.name || 'Test Creature',
    owner: Random.id(),
    dirty: true,
  } as any);
  const propsInserted = propsFromForest(creature.props, creature._id).map(prop => {
    return CreatureProperties.insertAsync(prop);
  });
  await Promise.all(propsInserted);
  // Compute before loading. Meteor 3 delivers observer changes asynchronously,
  // so a cache loaded first still holds pre-computation values when the test
  // runs, and the props' dirty flags start background recomputes that overlap
  // the following tests.
  await computeCreature(creature._id);
  loadCreature(creature._id, dummySubscription);
  await loadedCreatures.get(creature._id)?.ready;
}

export type TestCreature = {
  _id: string;
  name?: string;
  props: ForestProp[];
}

/**
 * get a list of random Ids
 */
export const getRandomIds = (count: number) => new Array(count).fill(undefined).map(() => Random.id());

/**
 * Creates a new Engine Action and applies the specified creature property
 * @param propId The _id of the property, any property that the engine can apply will work
 * @param userInputFn A function that simulates user input
 * @returns The Engine Action with mutations resulting from running the action
 */
export async function runActionById(propId: string, targetIds?: string[], userInput = inputProvider) {
  const prop = await CreatureProperties.findOneAsync(propId);
  const actionId = await createAction(prop, targetIds);
  const action = await EngineActions.findOneAsync(actionId);
  if (!action) throw 'Action is expected to exist';
  await applyAction(action, userInput, { simulate: true });
  return action;
}

/**
 * Creates and inserts a new Engine Action into the database
 * @param prop The property to start applying
 * @param targetIds A list of target ids
 * @returns Promise< id of the inserted Engine Action >
 */
function createAction(prop: any, targetIds?: string[]) {
  const action: EngineAction = {
    creatureId: prop.root.id,
    results: [],
    taskCount: 0,
    task: {
      prop,
      targetIds: targetIds || [],
    }
  };
  return EngineActions.insertAsync(action);
}

/**
 * Get all the mutations in the results of an engineAction
 */
export function allMutations(action: EngineAction, { withMessages = false } = {}) {
  const mutations: Mutation[] = [];
  action.results.forEach(result => {
    result.mutations.forEach(mutation => {
      // The log in English, as allLogContent gives it
      mutations.push(withMessages || !mutation.contents ? mutation : {
        ...mutation,
        contents: mutation.contents.map(withoutMessages),
      });
    });
  });
  return mutations;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const withoutMessages = ({ i18n, ...english }: LogContent) => english;

/**
 * Get all the updates in all mutations in the result of an Engine Action
 */
export function allUpdates(action: EngineAction) {
  const updates: Update[] = [];
  allMutations(action).forEach(mutation => {
    mutation.updates?.forEach(update => {
      updates.push(update);
    });
  });
  return updates;
}
/**
 * Get all the log content in all mutations in the result of an Engine Action
 */
export function allLogContent(action: EngineAction, { withMessages = false } = {}) {
  const contents: LogContent[] = [];
  allMutations(action, { withMessages: true }).forEach(mutation => {
    mutation.contents?.forEach(logContent => {
      // The English text is what these tests read; the messages for the
      // reader's language (`i18n`) are checked where they are made
      contents.push(withMessages ? logContent : withoutMessages(logContent));
    });
  });
  return contents;
}

/**
 * Creates an Engine Action that runs a task (a subtask such as dealDamage)
 * for a creature, and applies it as runActionById does
 */
export async function runTask(creatureId: string, task: any, userInput = inputProvider) {
  const actionId = await EngineActions.insertAsync({
    creatureId,
    results: [],
    taskCount: 0,
    task,
  } as EngineAction);
  const action = await EngineActions.findOneAsync(actionId);
  if (!action) throw 'Action is expected to exist';
  await applyAction(action, userInput, { simulate: true });
  return action;
}
