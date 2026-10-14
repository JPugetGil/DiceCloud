import EngineActions, { EngineAction } from '/imports/api/engine/action/EngineActions';
import mutationToPropUpdates from './mutationToPropUpdates';
import mutationToLogUpdates from '/imports/api/engine/action/functions/mutationToLogUpdates';
import { union, uniq } from 'lodash';
import CreatureLogs, { postLogToDiscord, trimCreatureLogs } from '/imports/api/creature/log/CreatureLogs';
import bulkWrite from '/imports/api/engine/shared/bulkWrite';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { softRemove } from '/imports/api/parenting/softRemove';
import computeCreature from '/imports/api/engine/computeCreature';
import { getCreature, reloadCachedProperties } from '/imports/api/engine/loadCreatures';
import { Meteor } from 'meteor/meteor';
import { DDP } from 'meteor/ddp';
import { Random } from 'meteor/random';
import { hiddenTargets } from '/imports/api/engine/action/functions/hiddenStats';
import { GM_CREATURE_TYPES, hiddenFrom } from '/imports/api/creature/creatureFolders/boardMonsters';
import {
  fitLineName, logLine, msg, namingTargets, withoutHiddenStats,
} from '/imports/api/creature/log/logMessages';
import { inTargetView, withoutView } from '/imports/api/creature/log/logViews';
import applyAction from '/imports/api/engine/action/functions/applyAction';
import getAutomaticInputProvider from '/imports/api/engine/action/functions/userInput/getAutomaticInputProvider';
import type { ReceivedDamage } from '/imports/api/engine/action/tasks/Task';
import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';

let getActionDiceRoller: typeof import('/imports/api/engine/action/functions/userInput/server/actionDice').getActionDiceRoller;
if (Meteor.isServer) {
  // require(), not import: the client runs this module too (the method's
  // simulation), and a static import would bundle node:crypto into it
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ({ getActionDiceRoller } = require('/imports/api/engine/action/functions/userInput/server/actionDice'));
}

/**
 * Writes what an action did: its changes to the properties, its log entry
 * (with `log` false, none: a turn event whose every line is silenced,
 * runTurnEvent), then recomputes the creatures it changed. On the server, the
 * creatures it acted on then get their entries (writeReceivedLogs), after
 * their own damage triggers fired
 */
export default async function writeActionResults(action: EngineAction, { log: writeLog = true }: { log?: boolean } = {}) {
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

  // A player's character acting on a game master's creature, a monster or a
  // non-player character, logs the damage dealt and not what it did to the
  // creature's hit points, capped by what it had left: the players read the
  // character's log (hiddenStats.ts). The creature's own log, its game
  // master's, gets the whole entry (writeReceivedLogs)
  const hiddenIds = await hiddenTargets(action.creatureId, allTargetIds);
  // An action on several creatures names each one in the lines about it alone
  const targetNames = await creatureNames(action.task?.targetIds);
  const shownContents = fitLog(namingTargets(
    withoutHiddenStats(logContents, hiddenIds).map(withoutView), action.task?.targetIds, id => targetNames.get(id),
  ));

  // Write the log
  const log = {
    _id: logId,
    content: shownContents,
    creatureId: action.creatureId,
    actionId: action._id,
    date: new Date(),
  };
  const logPromise = writeLog && CreatureLogs.insertAsync(log).then(() => {
    // Not in the client's simulation of the method: the server's result replaces it
    if (!Meteor.isServer) return;
    // Attacks, spells, checks, rests, damage: on Discord once written, as rolls
    // typed in the log are; a check with what rolls it again (D7)
    postLogToDiscord(log, action._rolledCheck && { reroll: action._rolledCheck });
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
  await Promise.all(recomputePromises);

  // Server only: the client's simulation has none of the targets' triggers,
  // and the server's entries replace whatever it would show
  if (Meteor.isServer && writeLog) {
    await writeReceivedLogs(action, logContents, hiddenIds, action._receivedDamage ?? []);
  }
}

/**
 * The names of the creatures an action acted on, by id, when it acted on
 * several: its actor's entry names them (namingTargets). On the client, those
 * it has (the party's boards)
 */
async function creatureNames(targetIds: string[] = []): Promise<Map<string, string | undefined>> {
  const ids = uniq(targetIds);
  const names = new Map<string, string | undefined>();
  if (ids.length < 2) return names;
  for (const id of ids) names.set(id, (await getCreature(id))?.name);
  return names;
}

// The game master's creatures, whose own log is the game master's alone
const isGmCreature = (creature: { type?: string } | undefined) => GM_CREATURE_TYPES.includes(creature?.type as string);

/**
 * The entry each creature the action acted on gets in its own log, which
 * its readers read, and which posts to its Discord channels where the
 * actor's entry does not (sendLogToDiscord's `besides`): "Goblin 1 → you",
 * then what concerns it (writeReceivedLog). First, the creature's own damage
 * triggers fire, on its behalf, for what the action did to its attributes
 * (ReceivedDamageTask): their lines end its entry.
 *
 * A creature of the actor's owner gets none, its owner reads the actor's
 * entry already, unless that entry or this one hides something: the game
 * master's own character, whose log the party's Discord channel shows,
 * hitting one of their monsters (`hiddenIds`, the targets whose stats the
 * actor's entry leaves out), or hit by one; or unless its triggers had
 * something to say
 */
async function writeReceivedLogs(action: EngineAction, contents: any[], hiddenIds: string[], received: ReceivedDamage[]) {
  const actor = await getCreature(action.creatureId);
  if (!actor) return;
  const targetIds = uniq([
    ...contents.flatMap(line => line.targetIds || []),
    ...received.map(change => change.targetId),
  ]).filter(id => id && id !== action.creatureId);
  // Each read once: every entry reads the other targets, a fight holds 64
  const targets = new Map<string, Acting>();
  for (const targetId of targetIds) {
    const target = await getCreature(targetId);
    if (target) targets.set(targetId, target);
  }
  for (const targetId of targetIds) {
    const target = targets.get(targetId);
    if (!target) continue;
    const changes = received.filter(change => change.targetId === targetId);
    const triggered = changes.length ? await fireReceivedDamageTriggers(targetId, changes) : [];
    const actorHidden = hiddenFrom(target, actor);
    const sameTable = target.owner === actor.owner && !actorHidden && !hiddenIds.includes(targetId);
    if (sameTable && !triggered.some(line => !line.silenced)) continue;
    const lines = [...receivedLines(contents, actor, target, [...targets.values()]), ...triggered];
    if (!lines.length) continue;
    await writeReceivedLog(action, actor, target, lines);
  }
}

// The creatures an entry is about, as read here
type Acting = { _id: string, name?: string, type?: string, owner?: string };

/**
 * The lines a creature the action acted on reads of it:
 * - a game master's monster or non-player character, the whole entry, as its
 *   game master reads it in the actor's log, but the stats of the other
 *   targets hidden from it (another owner's);
 * - any other, the lines that concern it, as the players of a target the
 *   actor is hidden from read them (logViews.ts): a game master's monster
 *   acting on a player's character.
 */
function receivedLines(contents: any[], actor: Acting, target: Acting, targets: Acting[]): any[] {
  const othersHidden = targets.filter(other => other._id !== target._id && hiddenFrom(target, other))
    .map(other => other._id);
  const actorHidden = hiddenFrom(target, actor);
  const lines = isGmCreature(target) && !actorHidden
    ? contents
    : contents.filter(line => line.targetIds?.includes(target._id));
  const shown = actorHidden
    ? lines.map(inTargetView).filter(line => line !== undefined)
    : lines.map(withoutView);
  return withoutHiddenStats(shown, othersHidden);
}

async function writeReceivedLog(action: EngineAction, actor: Acting, target: Acting, lines: any[]) {
  const received = logLine({
    name: msg('logs.receivedFrom', { name: actor.name || '?', target: target.name || '?' }),
  });
  // A name as long as a creature's own, and "→ you" after it
  const heading = { ...received, name: fitLineName(received.name ?? '') };
  const log = {
    content: fitLog([heading, ...lines]),
    creatureId: target._id,
    creatureName: actor.name,
    actionId: action._id,
    received: { fromCreatureId: actor._id, ...action._id && { actionId: action._id } },
    date: new Date(),
  };
  await CreatureLogs.insertAsync(log);
  // Not where the actor's entry goes: once in a party's channel
  postLogToDiscord(log, { besides: actor._id });
  await trimCreatureLogs(target._id);
}

/**
 * A creature's own damage triggers fire, on its behalf, for what another
 * creature's action did to its attributes (ReceivedDamageTask), as when it
 * damages itself. Like a turn event (runTurnEvent): an action in memory, its
 * dice from a secret of its own, nobody asked anything; what it changes is
 * written and computed. Its lines, which the creature's received entry ends
 * with
 */
async function fireReceivedDamageTriggers(targetId: string, changes: ReceivedDamage[]): Promise<any[]> {
  const pass: EngineAction = {
    _id: Random.id(),
    creatureId: targetId,
    task: {
      subtaskFn: 'receivedDamage',
      targetIds: [targetId],
      params: { changes: changes.map(({ propId, operation, value }) => ({ propId, operation, value })) },
    },
    results: [],
    taskCount: 0,
  };
  const rollDice = getActionDiceRoller({ _id: pass._id as string, seed: Random.secret() });
  try {
    await applyAction(pass, getAutomaticInputProvider(pass, rollDice));
  } catch (e) {
    // The action is written already: a trigger that fails costs its lines
    console.error(e);
    return [];
  }
  const lines = pass.results.flatMap(result => result.mutations.flatMap(mutationToLogUpdates)).map(withoutView);
  const changed = pass.results.some(result => result.mutations.some(
    mutation => mutation.updates?.length || mutation.inserts?.length || mutation.removals?.length,
  ));
  if (changed) await writeActionResults(pass, { log: false });
  return lines;
}

/**
 * The lines of an entry, as many as a log keeps (STORAGE_LIMITS): an action
 * with many targets can say more. The first ones, then how many more there
 * were
 */
function fitLog<T>(lines: T[]): T[] {
  const max = STORAGE_LIMITS.logContentCount;
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max - 1);
  return [...kept, logLine({ value: msg('logs.linesOmitted', { count: lines.length - kept.length }) }) as T];
}
