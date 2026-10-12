import { boardError } from '/imports/api/creature/creatureFolders/boardMonsters';
import { sessionName } from '/imports/api/creature/log/discord/partyMessages';
import type { DiscordSession } from '/imports/api/creature/log/discord/discordSession';
import { startSession, type Channel } from '/imports/api/creature/log/server/discordWebhooks';
import { botToken, createPublicThread } from '/imports/api/discord/server/botClient';

/*
 * "New session" in a new thread (phase D): in a text channel connected for
 * this party or character (D4 or /connect), and there only, the bot creates
 * the session's public thread, named after the date and the party, then the
 * session is the same as one in a thread the game master made: its header
 * posted there by the webhook, everything after it too. When the bot cannot
 * (not on the server, a permission missing), an error says to add it, and
 * the other ways stay: a header message, a thread's link.
 */

/** Opens a session in a thread the bot creates; throws an error the interface shows */
export async function startBotThreadSession(channel: Channel, timeZone?: string): Promise<DiscordSession> {
  if (!botToken() || !channel.channelId || !channel.guildId || !channel.key?.startsWith('channel:')) {
    throw boardError('discord.botUnavailable', 'discord.errors.botUnavailable', { status: '–' });
  }
  const name = sessionName({ label: channel.label, date: new Date(), language: channel.language, timeZone });
  const created = await createPublicThread(channel.channelId, name);
  if (!created.ok) {
    throw boardError('discord.botUnavailable', 'discord.errors.botUnavailable', {
      status: `${created.status ?? '–'}${created.code ? ` ${created.code}` : ''}`,
    });
  }
  return startSession(channel, timeZone, { guildId: channel.guildId, threadId: created.value.threadId });
}
