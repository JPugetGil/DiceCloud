/**
 * What the snackbar says once a Discord session is open (D3): a forum's new
 * post, a header message in a text channel, or the thread the user chose
 * @param {{ kind: string, name?: string }} opened
 * @param {(key: string, params?: object) => string} t
 */
export function sessionStartedText(opened, t) {
  if (opened.kind === 'forum') return t('discord.sessionStartedForum', { name: opened.name });
  if (opened.kind === 'thread') return t('discord.sessionStartedThread', { name: opened.name });
  return t('discord.sessionStartedChannel');
}
