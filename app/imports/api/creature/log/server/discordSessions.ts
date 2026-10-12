import { boardError } from '/imports/api/creature/creatureFolders/boardMonsters';
import { sessionHeader, sessionName, sessionResumed } from '/imports/api/creature/log/discord/partyMessages';
import { isPastSessionHere, type DiscordSession } from '/imports/api/creature/log/discord/discordSession';
import {
  forgetPastSession, inSessionQueue, openInThread, openSession, readPastSessions, sessionFailure, statusOf,
  type Channel, type ChannelKind,
} from '/imports/api/creature/log/server/discordWebhooks';
import { learnPastedChannel, rememberPastedKind } from '/imports/api/creature/log/server/pastedWebhooks';
import { DISCORD_CODES } from '/imports/api/creature/log/server/webhookSender';
import { botChannel, botToken, createPublicThread } from '/imports/api/discord/server/botClient';

/*
 * The sessions' buttons, one way each since 2026-10-12 (SPEC-sans-bot.md,
 * "séances uniformes"):
 *
 * - "New session": in a forum, a post of its own (the webhook's
 *   `thread_name`); in a text channel, a public thread DiceCloud's bot
 *   creates, whatever connected the channel (Connect to Discord, /connect, a
 *   pasted webhook), then everything goes there (`thread_id`). The bot only
 *   creates a thread in the channel the webhook posts in, as Discord says. If
 *   it cannot (no bot on this server, not on that Discord server, a
 *   permission missing), nothing else opens: an error says how to fix it. No
 *   header message, no thread's link any more.
 * - "Resume a session": one of the holder's last sessions in the channel it
 *   posts in now (discordSession.ts). A short "The session goes on" posted in
 *   its thread or post tells whether Discord takes it there (it reopens an
 *   archived thread); a thread Discord no longer knows leaves the list.
 *
 * Whether "New session" can work at all in a text channel, the settings ask
 * first (`sessionAvailability`): the bot asked whether it sees the channel.
 */

// Discord's channel types: text and announcement; forum and media
const TEXT_TYPES = [0, 5];
const FORUM_TYPES = [15, 16];

const kindOfType = (type: number): ChannelKind | undefined => FORUM_TYPES.includes(type) ? 'forum'
  : TEXT_TYPES.includes(type) ? 'text' : undefined;

// Keeps what a pasted webhook's channel is, once learned
async function rememberKind(channel: Channel, kind: ChannelKind) {
  if (!channel.pasted || channel.channelKind === kind) return;
  channel.channelKind = kind;
  await rememberPastedKind(channel.holder, channel.webhook.id, kind);
}

// What the bot says the channel is, if it sees it
async function kindSeenByBot(channelId?: string): Promise<ChannelKind | undefined> {
  if (!botToken() || !channelId) return undefined;
  const seen = await botChannel(channelId);
  return seen.ok ? kindOfType(seen.value.type) : undefined;
}

/**
 * Opens a new session on the channel: a forum post, or the bot's thread in a
 * text channel. Resolves with the session, or throws an error the interface
 * shows (boardError, `discord.errors.*`)
 */
export async function newSession(channel: Channel, timeZone?: string): Promise<DiscordSession> {
  const date = new Date();
  // A pasted webhook's channel, as Discord says now: the bot creates a
  // thread only where the webhook posts
  if (channel.pasted) {
    const learned = await inSessionQueue(channel, request => learnPastedChannel(channel.holder, channel.webhook, request));
    // Moved to another channel in Discord: what it is, to learn again
    if (learned && learned !== channel.channelId) channel.channelKind = undefined;
    if (learned) channel.channelId = learned;
  }
  let kind = channel.channelKind ?? await kindSeenByBot(channel.channelId);
  if (kind !== 'text') {
    // A forum, or not known yet: a text channel refuses the post (220003)
    const opened = await inSessionQueue(channel, request => openSession(request, channel, { date, timeZone }));
    if (opened.session) {
      await rememberKind(channel, 'forum');
      return opened.session;
    }
    if (!opened.textChannel) throw sessionFailure(opened.result);
    kind = 'text';
  }
  await rememberKind(channel, kind);
  // A text channel: the bot's thread, or nothing
  if (!botToken()) throw boardError('discord.noBot', 'discord.errors.noBot');
  if (!channel.channelId) throw boardError('discord.botUnavailable', 'discord.errors.botUnavailable', { status: '–' });
  const name = sessionName({ label: channel.label, date, language: channel.language, timeZone });
  const created = await createPublicThread(channel.channelId, name);
  if (!created.ok) throw boardError('discord.botUnavailable', 'discord.errors.botUnavailable', { status: statusOf(created) });
  const opened = await inSessionQueue(channel, request => openInThread(request, channel, {
    threadId: created.value.threadId, kind: 'thread', name, body: sessionHeader(name, channel.author), date,
  }));
  if (opened.session) return opened.session;
  if (!opened.result.ok && opened.result.gone) throw sessionFailure(opened.result);
  throw boardError('discord.threadRefused', 'discord.errors.threadRefused', { status: opened.refused ? '–' : statusOf(opened.result) });
}

/**
 * Resumes one of the holder's last sessions, of the channel it posts in now.
 * Resolves with the session, or throws an error the interface shows; a
 * thread Discord no longer knows leaves the list
 */
export async function resumeSession(channel: Channel, threadId: string, timeZone?: string): Promise<DiscordSession> {
  const past = (await readPastSessions(channel.holder)).find(one => one.threadId === threadId);
  if (!past || !isPastSessionHere(past, { channelId: channel.channelId, webhookId: channel.webhook.id })) {
    throw boardError('discord.resumeUnknown', 'discord.errors.resumeUnknown');
  }
  const date = new Date();
  const body = sessionResumed({ date, language: channel.language, timeZone, author: channel.author });
  const opened = await inSessionQueue(channel, request => openInThread(request, channel, {
    threadId, kind: past.kind, name: past.name, body, date,
  }));
  if (opened.session) return opened.session;
  const result = opened.result;
  if (!result.ok && result.gone) throw sessionFailure(result);
  if (!result.ok && result.code === DISCORD_CODES.unknownChannel) {
    // Deleted in Discord: no use offering it again
    await forgetPastSession(channel.holder, threadId);
    throw boardError('discord.threadGone', 'discord.errors.threadGone', { name: past.name ?? '' });
  }
  throw boardError('discord.resumeRefused', 'discord.errors.resumeRefused', { status: opened.refused ? '–' : statusOf(result) });
}

export type SessionAvailability = { newSession: 'ready' | 'noBot' };

/**
 * Whether "New session" can work on the channel: `noBot` for a text channel
 * the bot cannot create a thread in, as far as one can tell without trying
 * (no bot on this server; the bot not on that Discord server, or not seeing
 * the channel). A forum, or a channel not known yet, is `ready`: trying tells
 */
export async function sessionAvailability(channel: Channel): Promise<SessionAvailability> {
  const kind = channel.channelKind;
  if (kind === 'forum') return { newSession: 'ready' };
  if (!botToken()) return { newSession: kind === 'text' ? 'noBot' : 'ready' };
  // A pasted webhook's channel, not known yet (just pasted): asked of Discord
  if (channel.pasted && !channel.channelId) {
    channel.channelId = await inSessionQueue(channel, request => learnPastedChannel(channel.holder, channel.webhook, request))
      .catch(() => undefined);
  }
  if (!channel.channelId) return { newSession: 'ready' };
  const seen = await botChannel(channel.channelId);
  if (seen.ok) {
    const seenKind = kindOfType(seen.value.type);
    if (seenKind) await rememberKind(channel, seenKind);
    return { newSession: 'ready' };
  }
  // Refused, or not on that server: Discord's other answers tell nothing
  const refused = seen.status === 403 || seen.status === 404;
  return { newSession: kind === 'text' && refused ? 'noBot' : 'ready' };
}
