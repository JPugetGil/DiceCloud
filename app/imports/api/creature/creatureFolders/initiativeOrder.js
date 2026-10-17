// Creatures in an initiative tracker: characters, monsters and those added by
// hand. A leaf module: the folders' schema and their methods both read it
export const MAX_INITIATIVE_ENTRIES = 64;

/**
 * Initiative order: highest result first, ties to the highest bonus, then by
 * name; entries not rolled yet come last. The tracker's `turn` indexes this
 * order, so the server and the board must sort alike.
 */
export default function initiativeOrder(entries = []) {
  return [...entries].sort((a, b) => {
    const rolledA = Number.isFinite(a.initiative);
    const rolledB = Number.isFinite(b.initiative);
    if (rolledA !== rolledB) return rolledA ? -1 : 1;
    if (rolledA && a.initiative !== b.initiative) return b.initiative - a.initiative;
    const bonusA = a.bonus || 0;
    const bonusB = b.bonus || 0;
    if (bonusA !== bonusB) return bonusB - bonusA;
    return (a.name || '').localeCompare(b.name || '');
  });
}

/**
 * The turn after the entries change (a result typed in, a creature added):
 * the same creature keeps it, wherever the new order puts it. The tracker's
 * `turn` is an index into the order, so without this a result that moved
 * someone up gave the turn to whoever took their place
 */
export function turnAfterChange(entries = [], turn = 0, newEntries = []) {
  const active = initiativeOrder(entries)[turn];
  if (!active) return Math.min(turn, Math.max(newEntries.length - 1, 0));
  const index = initiativeOrder(newEntries).findIndex(entry => entry._id === active._id);
  return index === -1 ? Math.min(turn, Math.max(newEntries.length - 1, 0)) : index;
}

/**
 * The tracker once the entries `entryIds` leave it: `{ entries, turn, round }`,
 * and `started`, the entry whose turn now starts, if any. The creature whose
 * turn it is keeps it. If it leaves during a fight, the turn passes to the
 * next entry that stays, as it does when one entry is removed: from the last
 * of a round, the next round starts with the first. However many leave at
 * once, the turn passes once, to the right one. No turn ends: the creature
 * that leaves is out of the fight (server/turnEvents.ts, removeFromTracker)
 */
export function trackerWithout(tracker, entryIds = []) {
  const leaving = new Set(entryIds);
  const order = initiativeOrder(tracker?.entries);
  // The order of those that stay, which the new turn indexes: the sort is
  // stable, so sorting them again gives the same
  const kept = order.filter(entry => !leaving.has(entry._id));
  const entries = (tracker?.entries || []).filter(entry => !leaving.has(entry._id));
  const turn = tracker?.turn || 0;
  const round = tracker?.round || 0;
  const active = order[turn];
  if (!active) return { entries, turn: Math.min(turn, Math.max(kept.length - 1, 0)), round };
  if (!leaving.has(active._id)) return { entries, turn: kept.indexOf(active), round };
  const fighting = round > 0;
  const next = order.slice(turn + 1).find(entry => !leaving.has(entry._id));
  if (next) return { entries, turn: kept.indexOf(next), round, ...fighting && { started: next } };
  // It was the last of the round
  if (!fighting || !kept.length) return { entries, turn: 0, round };
  return { entries, turn: 0, round: round + 1, started: kept[0] };
}

// The tracker's round or turn as read, for an update that applies only while it is still so
const stillAt = value => value === undefined || value === null ? { $exists: false } : value;

/**
 * The selector of a folder whose tracker is still as read: the same round,
 * turn and entries, by id (not their order or marks). A change made from what
 * was read applies only then: a Next click and a creature leaving the tracker
 * at once never move the turn from an order that no longer is
 * (advanceTracker, removeFromTracker)
 */
export function trackerAsRead(tracker) {
  const ids = (tracker?.entries || []).map(entry => entry._id);
  return {
    'initiative.round': stillAt(tracker?.round),
    'initiative.turn': stillAt(tracker?.turn),
    'initiative.entries': { $size: ids.length },
    ...ids.length && { 'initiative.entries._id': { $all: ids } },
  };
}
