/*
 * The creatures a game master adds to the initiative tracker by hand (UX11):
 * light entries, not the bestiary. Their hit points and armor class are the
 * game master's: they are kept apart from the entries, in the folder's
 * `initiativeStats` (entry id → { hp, ac, damage }), which the publications
 * leave out for the players unless the game master shows them. So is its
 * status, unhurt, bloodied or down, which follows from them (entryStatus):
 * the players never learn how hurt a monster is otherwise.
 */
export const STATUSES = Object.freeze(['unhurt', 'bloodied', 'down']);

// Up to this many creatures added at once ("Goblin ×4")
export const MAX_COUNT = 20;

/**
 * An entry's status from its stats and the game master's "out of the fight":
 * down once out or at 0 hit points, bloodied once hurt, unhurt otherwise;
 * none for a creature without hit points that is still in the fight
 */
export function entryStatus(stats, out) {
  if (out) return 'down';
  const hp = stats?.hp;
  if (!(hp > 0)) return undefined;
  const damage = stats.damage || 0;
  if (damage >= hp) return 'down';
  return damage > 0 ? 'bloodied' : 'unhurt';
}

/**
 * The names of `count` creatures added together: the name alone for one,
 * numbered from where the tracker's creatures of that name stop otherwise
 * ("Goblin 1" to "Goblin 4", then "Goblin 5")
 */
export function numberedNames(name, count = 1, existingNames = []) {
  const base = name.trim();
  if (count <= 1) return [base];
  const pattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`);
  const taken = existingNames
    .map(existing => pattern.exec(existing || '')?.[1])
    .filter(Boolean)
    .map(Number);
  const start = taken.length ? Math.max(...taken) + 1 : 1;
  return Array.from({ length: count }, (_, i) => `${base} ${start + i}`);
}

/** Damage after `amount` more (healing when negative), between 0 and the hit points */
export function damageAfter(stats, amount) {
  const damage = (stats?.damage || 0) + amount;
  const hp = stats?.hp;
  return Math.max(0, Number.isFinite(hp) ? Math.min(damage, hp) : damage);
}

/**
 * What the party board publishes of the folder to someone of `role`: all of
 * it to the game master; to the players, neither the invitation's token nor
 * the creatures' stats, unless the game master shows them
 * @param {string | undefined} role
 * @param {any} folder
 * @returns {Record<string, 0>}
 */
export function boardFolderFields(role, folder) {
  if (role === 'gm') return {};
  if (folder?.initiative?.showStats) return { inviteToken: 0 };
  return { inviteToken: 0, initiativeStats: 0 };
}
