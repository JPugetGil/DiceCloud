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
 * it to the game master but the Discord webhook's URL, which no client gets
 * (they get its id); to the players, neither the invitation's token, nor the
 * party's Discord webhook and session, nor the creatures' stats, unless the
 * game master shows them
 * @param {string | undefined} role
 * @param {any} folder
 * @returns {Record<string, 0>}
 */
export function boardFolderFields(role, folder) {
  if (role === 'gm') return { 'discord.webhook': 0 };
  if (folder?.initiative?.showStats) return { inviteToken: 0, discord: 0 };
  return { inviteToken: 0, initiativeStats: 0, discord: 0 };
}

/**
 * The initiative tracker as someone who doesn't run the board receives it:
 * where each creature stands, but the roll and bonus of those whose stats
 * they don't see (the game master's monsters, the creatures added by hand),
 * which would tell their Dexterity. A projection cannot leave a field out of
 * some entries only: the publications pass the folder through this
 * (transformedCursor.js). `shownIds`: the creatures whose stats they see.
 * @param {any} initiative The folder's `initiative`, or undefined
 * @param {Iterable<string>} shownIds
 */
export function initiativeForPlayers(initiative, shownIds) {
  if (!initiative?.entries) return initiative;
  const shown = new Set(shownIds);
  return {
    ...initiative,
    entries: initiative.entries.map(entry => {
      if (entry.creatureId && shown.has(entry.creatureId)) return entry;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { roll, bonus, ...placed } = entry;
      return placed;
    }),
  };
}

/**
 * A folder's fields with its initiative as initiativeForPlayers gives it,
 * when they hold it (a change to another field leaves it out)
 * @param {Record<string, any>} fields
 * @param {Iterable<string>} shownIds
 */
export function folderFieldsForPlayers(fields, shownIds) {
  return 'initiative' in fields ? { ...fields, initiative: initiativeForPlayers(fields.initiative, shownIds) } : fields;
}

/**
 * For the publications of the folders that hold a character (its sheet's
 * fights and parties): by folder, whether the viewer runs it, and the
 * creatures whose stats they see otherwise, for folderFieldsForPlayers.
 * `creatures`: the folders' creatures, with their owner and type. A folder
 * not in the map (one that just started matching) shows no roll at all.
 * @param {{ _id: string, owner?: string, creatures?: string[] }[]} folders
 * @param {{ _id: string, owner?: string, type?: string }[]} creatures
 * @param {(creature: any, gmId: string | undefined) => boolean} hidesStats hidesStatsFromPlayers
 * @param {string} userId
 */
export function folderViews(folders, creatures, hidesStats, userId) {
  const byId = new Map(creatures.map(creature => [creature._id, creature]));
  return new Map(folders.map(folder => [folder._id, {
    runs: folder.owner === userId,
    shownIds: (folder.creatures || []).filter(id => byId.has(id) && !hidesStats(byId.get(id), folder.owner)),
  }]));
}
