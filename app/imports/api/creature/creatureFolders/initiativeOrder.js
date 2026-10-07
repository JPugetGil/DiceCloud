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
