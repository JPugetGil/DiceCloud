import type { LogI18n } from '/imports/api/creature/log/logMessages';

/*
 * How a log line shows to readers from whom one of the creatures of the
 * action is hidden: a game master's monster or non-player character, whose
 * numbers the players never read (hiddenFrom, boardMonsters.js). Two views,
 * which the engine says where it writes each line, in memory only: the log
 * never stores them (writeActionResults).
 *
 * - `targetView`: the actor is hidden from the target's readers. A game
 *   master's monster acting on a player's character: the character's log,
 *   which its player reads, and the party's Discord channel get the totals —
 *   "19, hit", "12 slashing damage", the saving throw's DC — and the
 *   character's own rolls whole; never the monster's bonuses, formulas or
 *   stat block text (Q2 of tools/party-monsters/SPEC-phases-2-3.md).
 * - `hiddenTargetView`: a creature the line is about is hidden from its
 *   readers (phase 2.3). A player's character acting on a monster: the
 *   character's log, the party's Discord channel and the logs of the other
 *   characters the action reached get the character's own lines whole and the
 *   results — hit or miss, the saving throw made or failed, the damage dealt,
 *   its resistances — never the monster's armor class, saving throw, hit
 *   points, stats or effects. The monster's own log, its game master's, gets
 *   every line whole.
 *
 * Both are allow-lists: a line that says nothing is not shown there, so a line
 * added to the engine later stays out of those logs until it says how it
 * shows.
 */

/** What a line shows: its name, its value, and their messages */
export type LineView = { name?: string, value?: string, i18n?: LogI18n };

/** A line's view: `true`, the line whole; or what it shows instead */
export type TargetView = true | LineView;

type ViewedLine = {
  name?: string,
  value?: string,
  i18n?: LogI18n,
  context?: unknown,
  targetIds?: string[],
  targetView?: TargetView,
  hiddenTargetView?: TargetView,
};

type Stored<T> = Omit<T, 'targetView' | 'hiddenTargetView'>;

/** The line whole: the target's own numbers (its hit points, its saving throw), or the actor's own line */
export const WHOLE = true as const;

/** The line's name alone, and its message: an action's title without its summary */
export function nameOnly(line: { name?: string, i18n?: LogI18n }): LineView {
  return {
    ...line.name !== undefined && { name: line.name },
    ...line.i18n?.name && { i18n: { name: line.i18n.name } },
  };
}

/** The line's name and its result alone: "Hit! **19**", without the roll that made it */
export function nameAndTotal(line: { name?: string, i18n?: LogI18n }, total: number | string): LineView {
  return { ...nameOnly(line), value: `**${total}**` };
}

/** The line as stored: without its views */
export function withoutView<T extends ViewedLine>(line: T): Stored<T> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { targetView, hiddenTargetView, ...stored } = line;
  return stored;
}

// The line as a view shows it, or undefined when it does not. What it shows
// replaces its name, value and messages, and its details (`context`) go;
// whether it is inline or silenced, and whom it targets, stay
function shownAs<T extends ViewedLine>(line: T, view: TargetView | undefined): Stored<T> | undefined {
  const stored = withoutView(line);
  if (view === true) return stored;
  if (!view) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { name, value, i18n, context, ...flags } = stored;
  return { ...flags, ...view } as Stored<T>;
}

/** The line as the readers of a target the actor is hidden from see it, or undefined when they don't */
export function inTargetView<T extends ViewedLine>(line: T): Stored<T> | undefined {
  return shownAs(line, line.targetView);
}

/** The line as readers from whom a creature it is about is hidden see it, or undefined when they don't */
export function inHiddenTargetView<T extends ViewedLine>(line: T): Stored<T> | undefined {
  return shownAs(line, line.hiddenTargetView);
}

/**
 * The line as some readers see it, or undefined when they don't:
 * - `actorHidden`: the actor is hidden from them (targetView);
 * - `hiddenIds`: the creatures hidden from them, a line about any of which
 *   shows its hiddenTargetView.
 * A line under both shows when one of its views is whole, as the other shows
 * it; two partial views of the same line don't combine, and it doesn't show.
 * Under neither, the line whole
 */
export function seenBy<T extends ViewedLine>(
  line: T, { actorHidden = false, hiddenIds = [] }: { actorHidden?: boolean, hiddenIds?: string[] },
): Stored<T> | undefined {
  const aboutHidden = !!line.targetIds?.some(id => hiddenIds.includes(id));
  if (!aboutHidden) return actorHidden ? inTargetView(line) : withoutView(line);
  if (!actorHidden) return inHiddenTargetView(line);
  if (line.targetView === true) return inHiddenTargetView(line);
  if (line.hiddenTargetView === true) return inTargetView(line);
  return undefined;
}
