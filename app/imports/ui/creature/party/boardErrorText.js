/**
 * The text of a party board method's refusal in the reader's language: the
 * message its details name (boardError: monsters.errors.*, initiative.full),
 * else the server's reason, in English
 * @param {any} error
 * @param {(key: string, params?: object) => string} t
 */
export default function boardErrorText(error, t) {
  const i18n = error?.details?.i18n;
  if (i18n?.key) return t(i18n.key, i18n.params || {});
  return error?.reason || error?.message || String(error);
}
