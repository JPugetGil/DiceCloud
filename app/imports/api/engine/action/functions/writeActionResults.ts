import EngineActions, { EngineAction } from '/imports/api/engine/action/EngineActions';
import mutationToPropUpdates from './mutationToPropUpdates';
import mutationToLogUpdates from '/imports/api/engine/action/functions/mutationToLogUpdates';
import { union, uniq } from 'lodash';
import CreatureLogs, { postLogToDiscord, trimCreatureLogs } from '/imports/api/creature/log/CreatureLogs';
import bulkWrite from '/imports/api/engine/shared/bulkWrite';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { softRemove } from '/imports/api/parenting/softRemove';
import computeCreature from '/imports/api/engine/computeCreature';
import { reloadCachedProperties } from '/imports/api/engine/loadCreatures';
import { Meteor } from 'meteor/meteor';
import { DDP } from 'meteor/ddp';

export default async function writeActionResults(action: EngineAction) {
  if (!action._id) throw new Meteor.Error('type-error', 'Action does not have an _id');
  // Take the log's id before any write starts: in the client's simulation, a
  // write still in flight is the current method invocation, and an id drawn
  // from it differs from the server's, so the log reached the client twice
  const logId = DDP.randomStream('/collection/creatureLogs').id();
  const engineActionPromise = EngineActions.removeAsync(action._id);
  const creaturePropUpdates: any[] = [];
  const logContents: any[] = [];
  const removedPropIds: string[] = [];

  // Collect all the updates, removals and log content
  action.results.forEach(result => {
    result.mutations.forEach(mutation => {
      creaturePropUpdates.push(...mutationToPropUpdates(mutation));
      logContents.push(...mutationToLogUpdates(mutation));
      mutation.removals?.forEach(removal => removedPropIds.push(removal.propId));
    });
  });
  const allTargetIds: string[] = union(...logContents.map(c => c.targetIds));

  // Write the log
  const log = {
    _id: logId,
    content: logContents,
    creatureId: action.creatureId,
    actionId: action._id,
    date: new Date(),
  };
  const logPromise = CreatureLogs.insertAsync(log).then(() => {
    // Not in the client's simulation of the method: the server's result replaces it
    if (!Meteor.isServer) return;
    // Attacks, spells, checks, rests, damage: on Discord once written, as rolls
    // typed in the log are
    postLogToDiscord(log);
    return trimCreatureLogs(action.creatureId);
  });

  // Write the bulk updates, force them to sequential mode means we immediately get the results
  // in the subscription, rather than waiting for oplog tailing to catch up
  const bulkWritePromise = await bulkWrite(creaturePropUpdates, CreatureProperties, true);

  await Promise.all([engineActionPromise, logPromise, bulkWritePromise]);

  // A removed buff goes with everything under it, as when it is removed from
  // the sheet, and can be restored the same way. The sequential writes above
  // only insert and update: removals used to be dropped there
  for (const propId of uniq(removedPropIds)) {
    const prop = await CreatureProperties.findOneAsync(propId);
    if (prop && !prop.removed) await softRemove(CreatureProperties, prop);
  }

  // Recompute the creatures involved. Their caches have not heard of the writes
  // above yet: computing from them would evaluate everything that depends on a
  // changed value (a toggle's condition, a slot's condition) as it was before
  // the action, and nothing would recompute it afterwards.
  const recomputePromises = uniq([action.creatureId, ...allTargetIds]).map(async creatureId => {
    await reloadCachedProperties(creatureId);
    await computeCreature(creatureId);
  });

  return Promise.all(recomputePromises);
}
