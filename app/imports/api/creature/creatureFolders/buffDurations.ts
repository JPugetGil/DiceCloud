/**
 * How long an effect (a buff) lasts, in combat rounds. A 5e duration of
 * 1 minute is 10 rounds; "1 turn" is a round, as each creature has one turn a
 * round. undefined when it has no duration, or one that isn't counted in
 * rounds (until dispelled, a long rest...).
 */
const UNIT_ROUNDS: Record<string, number> = {
  round: 1, rounds: 1, rnd: 1, rnds: 1, turn: 1, turns: 1,
  minute: 10, minutes: 10, min: 10, mins: 10,
  hour: 600, hours: 600, h: 600, hr: 600, hrs: 600,
};

const DURATION_TEXT = /^(\d+)\s*([a-z]+)?$/;

export function buffDurationRounds(
  buff: { duration?: { calculation?: string, value?: unknown } } | undefined
): number | undefined {
  // The libraries write durations as text ("1 minute"): read the text first
  const text = buff?.duration?.calculation?.trim().toLowerCase();
  if (text) {
    const match = DURATION_TEXT.exec(text);
    if (match) {
      const unit = match[2] === undefined ? 1 : UNIT_ROUNDS[match[2]];
      const rounds = unit && Number(match[1]) * unit;
      return rounds && rounds > 0 ? rounds : undefined;
    }
  }
  const value = buff?.duration?.value;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) return Math.round(value);
  return undefined;
}

/** The rounds an effect has left, undefined when it isn't counted in rounds */
export function buffRoundsLeft(
  buff: { duration?: { calculation?: string, value?: unknown }, durationSpent?: number } | undefined
): number | undefined {
  const rounds = buffDurationRounds(buff);
  if (rounds === undefined) return undefined;
  return Math.max(rounds - (buff?.durationSpent || 0), 0);
}

/*
 * Whose turns count an effect down, and when (phase 3.5 of the monsters).
 * By default, the start of each turn of the creature it is on, its holder.
 * An effect can instead follow the creature that applied it, its source
 * ("until the end of the caster's next turn"), and the end of the turns.
 *
 * - An effect anchored on its source follows the source's turns while the
 *   source has turns in the fight: an entry in the party's initiative
 *   tracker. Once it has none (removed from the tracker, deleted, gone from
 *   the party), or when no fight runs, the effect follows its holder's turns:
 *   it still ends, at most a round off.
 * - An effect that ends at the end of a turn counts the turns that start
 *   after it was applied: applied during its creature's turn, that turn is
 *   not its "next turn". The first turn start sets its rounds spent to 0
 *   (countDurationsDown); until then it has none.
 */

export type DurationEvent = 'turnStart' | 'turnEnd';

type AnchoredBuff = {
  durationAnchor?: string,
  durationEvent?: string,
  appliedBy?: { id?: string, name?: string },
} | undefined;

/** The event of a turn that counts the effect down: the start of the turn, or its end */
export function durationEventOf(buff: AnchoredBuff): DurationEvent {
  return buff?.durationEvent === 'turnEnd' ? 'turnEnd' : 'turnStart';
}

/**
 * The creature whose turns count the effect down instead of its holder's,
 * if any: the one that applied it, when the effect follows it and it is
 * another creature than the holder
 */
export function durationSourceOf(buff: AnchoredBuff, holderId: string): string | undefined {
  const sourceId = buff?.durationAnchor === 'source' ? buff.appliedBy?.id : undefined;
  return sourceId && sourceId !== holderId ? sourceId : undefined;
}

/**
 * The creature whose turns count the effect down in a fight: its source while
 * the source has turns in it (`sourcesWithTurns`, the creatures of the
 * party's tracker), else its holder
 */
export function durationClockOf(buff: AnchoredBuff, holderId: string, sourcesWithTurns: readonly string[] = []): string {
  const sourceId = durationSourceOf(buff, holderId);
  return sourceId && sourcesWithTurns.includes(sourceId) ? sourceId : holderId;
}
