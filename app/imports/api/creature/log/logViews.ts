import type { LogI18n } from '/imports/api/creature/log/logMessages';

/*
 * How a log line shows to the players of a creature that another creature
 * acted on, when the acting creature's numbers are hidden from them: a game
 * master's monster or non-player character acting on a player's character
 * (hiddenFrom(target, actor), boardMonsters.js). The character's log, which
 * its player reads, and the party's Discord channel get the totals — "19,
 * hit", "12 slashing damage", the saving throw's DC — and the character's own
 * rolls whole; never the monster's bonuses, formulas or stat block text (Q2 of
 * tools/party-monsters/SPEC-phases-2-3.md).
 *
 * The engine says it where it writes each line (`targetView`), in memory
 * only: the log never stores it (writeActionResults). It is an allow-list: a
 * line that says nothing is not shown there, so a line added to the engine
 * later stays out of those logs until it says how it shows. The view of the
 * actor's own log when a target is hidden from it (phase 2.3, a player's
 * character acting on a monster) is the other half, still to come.
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
  targetView?: TargetView,
};

/** The line whole: the target's own numbers (its hit points, its saving throw) */
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

/** The line as stored: without its view */
export function withoutView<T extends ViewedLine>(line: T): Omit<T, 'targetView'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { targetView, ...stored } = line;
  return stored;
}

/**
 * The line as the readers of a target the actor is hidden from see it, or
 * undefined when they don't. What it shows replaces its name, value and
 * messages, and its details (`context`) go; whether it is inline or silenced,
 * and whom it targets, stay
 */
export function inTargetView<T extends ViewedLine>(line: T): Omit<T, 'targetView'> | undefined {
  const view = line.targetView;
  const stored = withoutView(line);
  if (view === true) return stored;
  if (!view) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { name, value, i18n, context, ...flags } = stored;
  return { ...flags, ...view } as Omit<T, 'targetView'>;
}
