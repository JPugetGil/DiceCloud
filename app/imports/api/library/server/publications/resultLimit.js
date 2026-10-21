// The most results a library search publishes: the client asks for more by
// fifties ("Load more"), and asked for any number before
export const MAX_RESULTS = 1000;

/**
 * The number of results to publish: what the client asks, a whole number
 * from 1 to MAX_RESULTS, or the fallback when it asks nothing usable
 * @param {unknown} asked
 * @param {number} fallback
 */
export default function resultLimit(asked, fallback) {
  const limit = typeof asked === 'number' && Number.isFinite(asked) ? Math.floor(asked) : fallback;
  return Math.min(Math.max(limit, 1), MAX_RESULTS);
}
