/**
 * What the snackbar says once a Discord session is open (D3): a forum's new
 * post, the thread the bot created in a text channel, or a session resumed
 * @param {{ kind: string, name?: string, resumed?: boolean }} opened
 * @param {(key: string, params?: object) => string} t
 */
export function sessionStartedText(opened, t) {
  if (opened.resumed) return t('discord.sessionResumed', { name: opened.name || '' });
  if (opened.kind === 'forum') return t('discord.sessionStartedForum', { name: opened.name });
  return t('discord.sessionStartedThread', { name: opened.name });
}
