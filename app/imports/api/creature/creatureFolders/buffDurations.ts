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
