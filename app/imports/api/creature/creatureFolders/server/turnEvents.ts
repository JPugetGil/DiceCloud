import type { Mongo } from 'meteor/mongo';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { trackerAsRead, trackerWithout } from '/imports/api/creature/creatureFolders/initiativeOrder';
import { initiativeChanged } from '/imports/api/creature/log/server/discordInitiative';
import { applyTurnEvents, hasTurnEventWork, type TurnEventOptions } from '/imports/api/engine/action/server/runTurnEvent';
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
 * The turn also passes when the creature whose turn it is leaves the tracker,
 * whatever takes it out (removeFromTracker): the tracker's remove button, the
 * creature deleted from its sheet or the board, its player leaving the
 * party, "End the encounter" deleting the monsters while the fight goes on.
 * The next creature's turn starts then, under the same claim.
 *
 * A creature's turn also counts down the effects the party's other
 * creatures hold that are anchored on its turns (phase 3.5): those creatures
 * are the party's in the folder, in the tracker or not; an effect anchored on
 * a creature without turns in the tracker follows its holder's
 * (durationClockOf). Those passes happen under the creature's claim: once.
 *
 * A creature with nothing to do on the event (hasTurnEventWork, one query:
 * most monsters) costs that query alone: no mark either, whose write would
 * send the whole tracker again to everyone watching it.
 *
 * One folder's events run one after the other, in the order the turn moved,
 * so that a turn never ends before it started.
 */

type Entry = { _id: string, creatureId?: string, name?: string, initiative?: number, bonus?: number };
type TurnMark = { entry?: Entry, round: number };
export type TurnPass = { ended?: TurnMark, started?: TurnMark };

type FolderDoc = {
  _id: string,
  owner?: string,
  members?: string[],
  creatures?: string[],
  trackDurations?: boolean,
  initiative?: { round?: number, turn?: number, entries?: Entry[] },
};

const Folders = CreatureFolders as unknown as Mongo.Collection<FolderDoc & Record<string, any>>;

const MARKS: Record<TurnEventName, 'startedRound' | 'endedRound'> = {
  turnStart: 'startedRound',
  turnEnd: 'endedRound',
};

/**
 * Marks the entry's turn as started (or ended) in `round`, if the tracker is
 * still at that round and the entry had not been: whether this call did. The
 * turn of the last creature of a round ends as the next round starts: the
 * tracker is at the next round already (phase 3.5 found its turn end never
 * happened)
 */
async function claim(folderId: string, entryId: string, eventName: TurnEventName, round: number) {
  const mark = MARKS[eventName];
  const updated = await Folders.updateAsync({
    _id: folderId,
    'initiative.round': eventName === 'turnEnd' ? { $in: [round, round + 1] } : round,
    'initiative.entries': { $elemMatch: { _id: entryId, [mark]: { $not: { $gte: round } } } },
  }, {
    $set: { [`initiative.entries.$.${mark}`]: round },
  });
  return updated > 0;
}

/**
 * The creatures whose turn events the server runs: the folder's creatures of
 * its game master's or of one of its players'. Never another user's
 * character the game master put in the folder: that user never joined. One
 * query for the whole pass
 */
async function partyOf(folder: FolderDoc): Promise<Set<string>> {
  if (!folder.creatures?.length || !folder.owner) return new Set();
  const creatures = await Creatures.find({
    _id: { $in: folder.creatures },
    owner: { $in: [folder.owner, ...folder.members || []] },
  }, { fields: { _id: 1 } }).fetchAsync();
  return new Set(creatures.map(creature => creature._id));
}

async function turnEvent(
  folder: FolderDoc, eventName: TurnEventName, mark: TurnMark | undefined, options: TurnEventOptions,
) {
  const entry = mark?.entry;
  if (!entry?.creatureId || !mark?.round) return;
  try {
    if (!options.holderIds?.includes(entry.creatureId)) return;
    if (!await hasTurnEventWork(entry.creatureId, eventName, options)) return;
    if (!await claim(folder._id, entry._id, eventName, mark.round)) return;
    await applyTurnEvents(entry.creatureId, eventName, options);
  } catch (error) {
    // The turn still moves on
    console.error(error);
  }
}

async function pass(folderId: string, { ended, started }: TurnPass) {
  if (!ended?.entry?.creatureId && !started?.entry?.creatureId) return;
  const folder = await Folders.findOneAsync(folderId, {
    fields: { owner: 1, members: 1, creatures: 1, trackDurations: 1, 'initiative.entries.creatureId': 1 },
  });
  if (!folder) return;
  const party = await partyOf(folder);
  const options: TurnEventOptions = {
    countDurations: folder.trackDurations !== false,
    // The party's creatures, whose effects anchored on a creature its turns count down
    holderIds: [...party],
    // Those with turns in the tracker, which count down the effects anchored on them
    sourcesWithTurns: [...new Set((folder.initiative?.entries || [])
      .map(trackerEntry => trackerEntry.creatureId)
      .filter((id): id is string => !!id && party.has(id)))],
  };
  await turnEvent(folder, 'turnEnd', ended, options);
  await turnEvent(folder, 'turnStart', started, options);
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

// Tries before giving up on a tracker that keeps changing as it is read
const REMOVAL_ATTEMPTS = 10;

/**
 * Takes entries out of the folder's tracker: those of `entryIds`, and those
 * of the creatures `creatureIds`. The creature whose turn it is keeps it. If
 * it leaves during a fight, the turn passes to the next entry that stays, or
 * to the first of the next round (trackerWithout), whose turn starts, once,
 * under the same claim as Next's; however many leave at once, one turn
 * starts. Its turn does not end: it is out of the fight. Every way out of the
 * tracker comes here (the remove button, a deleted creature, a player who
 * leaves, the encounter's monsters): the turn passes the same.
 *
 * Read, then written while the tracker is still as read (trackerAsRead),
 * again if it changed: a Next click at the same time either moved the turn
 * first, and nothing passes here, or finds the tracker changed and does not
 * move it (advanceTracker). The turn starts once the tracker is written:
 * those that left are out of the creatures with turns, and the effects
 * anchored on them follow their holders' turns (phase 3.5). Whether entries
 * left. Server only
 */
export async function removeFromTracker(
  folderId: string, { entryIds = [], creatureIds = [] }: { entryIds?: string[], creatureIds?: string[] },
): Promise<boolean> {
  for (let attempt = 0; attempt < REMOVAL_ATTEMPTS; attempt += 1) {
    const folder = await Folders.findOneAsync(folderId, { fields: { initiative: 1 } });
    const tracker = folder?.initiative;
    const leaving = (tracker?.entries || []).filter(entry => entryIds.includes(entry._id)
      || (!!entry.creatureId && creatureIds.includes(entry.creatureId))).map(entry => entry._id);
    if (!tracker || !leaving.length) return false;
    const { turn, round, started } = trackerWithout(tracker, leaving) as { turn: number, round: number, started?: Entry };
    const updated = await Folders.updateAsync({ _id: folderId, ...trackerAsRead(tracker) }, {
      // Pulled, not written back: the others keep the marks set meanwhile
      $pull: { 'initiative.entries': { _id: { $in: leaving } } },
      $set: { 'initiative.turn': turn, ...round !== (tracker.round || 0) && { 'initiative.round': round } },
      $unset: Object.fromEntries(leaving.map(id => [`initiativeStats.${id}`, 1])),
    } as any);
    if (!updated) continue;
    if (started) await passTurn(folderId, { started: { entry: started, round } });
    initiativeChanged(folderId, 'update');
    return true;
  }
  throw new Error(`The initiative tracker of folder ${folderId} kept changing: entries not removed`);
}
