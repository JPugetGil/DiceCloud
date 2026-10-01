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
