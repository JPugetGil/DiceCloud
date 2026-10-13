import type { Mongo } from 'meteor/mongo';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { applyTurnEvent, hasTurnEventWork } from '/imports/api/engine/action/server/runTurnEvent';
import type { TurnEventName } from '/imports/api/engine/action/tasks/Task';

/*
 * The turn events of a party's initiative tracker (phase 3.1): when the turn
 * passes, the turn of the creature that had it ends, then the turn of the
 * creature that gets it starts (runTurnEvent). For every creature of the
 * party in the tracker, the players' characters as well as the game master's
 * monsters, whoever moved the turn on: the board, Discord's "Next turn" or
 * "End my turn" (initiativeMethods.js, advanceTracker).
 *
 * Each happens once per round and entry, whatever the tracker does: the entry
 * keeps the round its turn last started (startedRound) and ended
 * (endedRound), set by an update that applies only while they are older
 * (claim). Two clicks at once, Discord and the board at once, or going back a
 * turn then forward again set it once, and the event follows that one alone.
 * Rolling initiative again starts round 1 with new entries: the first turn
 * starts again (accepted).
 *
 * A creature with nothing to do on the event (hasTurnEventWork, one query:
 * most monsters) costs that query alone: no mark either, whose write would
 * send the whole tracker again to everyone watching it.
 *
 * One folder's events run one after the other, in the order the turn moved,
 * so that a turn never ends before it started.
 */

type Entry = { _id: string, creatureId?: string };
type TurnMark = { entry?: Entry, round: number };
export type TurnPass = { ended?: TurnMark, started?: TurnMark };

type FolderDoc = {
  _id: string,
  owner?: string,
  members?: string[],
  creatures?: string[],
  trackDurations?: boolean,
};

const Folders = CreatureFolders as unknown as Mongo.Collection<FolderDoc & Record<string, any>>;

const MARKS: Record<TurnEventName, 'startedRound' | 'endedRound'> = {
  turnStart: 'startedRound',
  turnEnd: 'endedRound',
};

/**
 * Marks the entry's turn as started (or ended) in `round`, if the tracker is
 * still at that round and the entry had not been: whether this call did
 */
async function claim(folderId: string, entryId: string, eventName: TurnEventName, round: number) {
  const mark = MARKS[eventName];
  const updated = await Folders.updateAsync({
    _id: folderId,
    'initiative.round': round,
    'initiative.entries': { $elemMatch: { _id: entryId, [mark]: { $not: { $gte: round } } } },
  }, {
    $set: { [`initiative.entries.$.${mark}`]: round },
  });
  return updated > 0;
}

/**
 * Whether the server runs the creature's turn events: one of the folder's
 * creatures, of its game master's or of one of its players'. Never another
 * user's character the game master put in the folder: that user never joined
 */
async function ofTheParty(folder: FolderDoc, creatureId: string) {
  if (!folder.creatures?.includes(creatureId)) return false;
  const creature = await Creatures.findOneAsync(creatureId, { fields: { owner: 1 } });
  const owner = creature?.owner;
  return !!owner && (owner === folder.owner || !!folder.members?.includes(owner));
}

async function turnEvent(folder: FolderDoc, eventName: TurnEventName, mark: TurnMark | undefined) {
  const entry = mark?.entry;
  if (!entry?.creatureId || !mark?.round) return;
  try {
    if (!await ofTheParty(folder, entry.creatureId)) return;
    const countDurations = folder.trackDurations !== false;
    if (!await hasTurnEventWork(entry.creatureId, eventName, { countDurations })) return;
    if (!await claim(folder._id, entry._id, eventName, mark.round)) return;
    await applyTurnEvent(entry.creatureId, eventName, { countDurations });
  } catch (error) {
    // The turn still moves on
    console.error(error);
  }
}

async function pass(folderId: string, { ended, started }: TurnPass) {
  if (!ended?.entry?.creatureId && !started?.entry?.creatureId) return;
  const folder = await Folders.findOneAsync(folderId, {
    fields: { owner: 1, members: 1, creatures: 1, trackDurations: 1 },
  });
  if (!folder) return;
  await turnEvent(folder, 'turnEnd', ended);
  await turnEvent(folder, 'turnStart', started);
}

// Each folder's turn events so far, in order
const queues = new Map<string, Promise<void>>();

/**
 * The turn passed in the folder's tracker: the end of `ended`'s turn in its
 * round, then the start of `started`'s, each once. Resolves once both ran,
 * after the folder's earlier events. Server only
 */
export function passTurn(folderId: string, turnPass: TurnPass): Promise<void> {
  const next = (queues.get(folderId) ?? Promise.resolve())
    .then(() => pass(folderId, turnPass))
    .catch(error => console.error(error));
  queues.set(folderId, next);
  next.finally(() => {
    if (queues.get(folderId) === next) queues.delete(folderId);
  });
  return next;
}

/** Resolves once the turn events so far have run (for tests) */
export async function turnEventsIdle() {
  while (queues.size) await Promise.all([...queues.values()]);
}
