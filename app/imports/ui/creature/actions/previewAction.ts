import { Random } from 'meteor/random';
import { ActionSchema, type EngineAction } from '/imports/api/engine/action/EngineActions';
import applyAction from '/imports/api/engine/action/functions/applyAction';
import getDeterministicDiceRoller from '/imports/api/engine/action/functions/userInput/getDeterministicDiceRoller';
import type InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import type Task from '/imports/api/engine/action/tasks/Task';
import type { LogContent } from '/imports/api/engine/action/tasks/TaskResult';

/**
 * What a task would do, without doing it (UX8): the engine simulates it on
 * the client, as doAction does before it calls the server, but nothing is
 * inserted, sent or saved. Returns the lines it would log; when it would ask
 * the user for something (a choice, a roll to step through), `needsInput` is
 * set and the lines stop there.
 */
export default async function previewAction({ creatureId, task }: { creatureId: string, task: Task }): Promise<{
  contents: LogContent[],
  needsInput: boolean,
}> {
  const action = ActionSchema.clean({
    creatureId, task, results: [], taskCount: 0, _decisions: [],
  }) as EngineAction;
  action._id = Random.id();
  const inputRequested = () => {
    throw 'input-requested';
  };
  const provider: InputProvider = {
    nextStep: inputRequested,
    // Local dice, from a made-up seed: nothing is inserted, so the server
    // draws nothing, and these numbers are never saved. The action itself,
    // once confirmed, rolls its own dice through doAction
    rollDice: getDeterministicDiceRoller(action._id),
    choose: inputRequested,
    advantage: inputRequested,
    check: inputRequested,
  };
  let needsInput = false;
  try {
    await applyAction(action, provider, { simulate: true });
  } catch (error) {
    if (error !== 'input-requested') throw error;
    needsInput = true;
  }
  const contents = (action.results || [])
    .flatMap(result => result.mutations || [])
    .flatMap(mutation => mutation.contents || []);
  return { contents, needsInput };
}
