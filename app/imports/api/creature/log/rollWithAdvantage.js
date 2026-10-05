/*
 * A roll typed in the log, or thrown with the log's quick dice, made with
 * advantage or disadvantage: its first d20 becomes two, of which the lower
 * (or the higher) is dropped. A roll without a single d20 is left as it is.
 */
const SINGLE_D20 = /(?<![\w.)\]])1?d20(?![\w.(])/;

/** The roll with advantage (1), disadvantage (-1), or as it is (0) */
export default function rollWithAdvantage(roll, advantage) {
  if (!advantage || typeof roll !== 'string') return roll;
  const twoDice = advantage > 0 ? 'dropLowest(2d20)' : 'dropHighest(2d20)';
  return roll.replace(SINGLE_D20, twoDice);
}
