import { Meteor } from 'meteor/meteor';
import type { Mongo } from 'meteor/mongo';
import { escapeRegExp, uniq } from 'lodash';
import Creatures from '/imports/api/creature/creatures/Creatures';
import VERSION from '/imports/constants/VERSION';
import {
  discordMessages, logComponents, webhookUsername, discordLanguage, translatorFor,
  type DiscordLanguage, type LogLine,
} from '/imports/api/creature/log/discord/discordMessages';
import { sessionHeader, sessionName, THREAD_NAME_LENGTH } from '/imports/api/creature/log/discord/partyMessages';
import {
  sessionOf, withPastSession, type DiscordSession, type PastSession,
} from '/imports/api/creature/log/discord/discordSession';
import { parseWebhookURL, type Webhook } from '/imports/api/creature/log/discord/webhookUrl';
import { publishes, type PartyDiscord } from '/imports/api/creature/log/discord/partyPublishing';
import type { DiscordChannel } from '/imports/api/creature/log/discord/discordChannel';
import { connectedWebhook, forgetConnectedWebhook } from '/imports/api/creature/log/server/connectedWebhooks';
import { isPastedWebhook, learnPastedChannel, pastedWebhook } from '/imports/api/creature/log/server/pastedWebhooks';
import { interactionOrigin } from '/imports/api/discord/server/interactions/interactionOrigin';
import { interactionsPublicKey } from '/imports/api/discord/server/interactions/interactionSignature';
import { rerollButtonsOf, saveReroll } from '/imports/api/discord/server/interactions/interactionRerolls';
import { addButtons } from '/imports/api/discord/server/interactions/interactionReplies';
import { hidesStatsFromPlayers, hiddenFrom, boardError, GM_CREATURE_TYPES } from '/imports/api/creature/creatureFolders/boardMonsters';
import {
  DISCORD_API, DISCORD_CODES, TEST_API_VARIABLE, createWebhookSender, discordApiBase, discordUserAgent, postMessage,
  type DiscordResult, type Requester, type WebhookSender,
} from '/imports/api/creature/log/server/webhookSender';

export {
  DISCORD_API, TEST_API_VARIABLE, createWebhookSender, discordApiBase, parseWebhookURL,
  type Webhook, type WebhookSender,
};

/*
 * Posts the log entries of characters to Discord (option 1 of the Discord
 * analysis, D2 and D3), through the webhooks' queues of webhookSender.ts.
 *
 * An entry goes to the character's own webhook, and to the webhook of each
 * party it plays in (D2): those of the game master and of the players, never
 * a game master's monster or non-player character, whose stats the players
 * never see, and only while the game master lets the party post its rolls
 * (partyPublishing.ts). Several of those that are the same webhook (the same
 * id) post once: the party's way, its session and the game master's language.
 * Lines that would give away a monster's hit points never leave.
 *
 * Each webhook posts into its holder's session (discordSession.ts), looked up
 * when the message leaves: the forum post or the thread of the session, or
 * the channel. A session's thread that Discord no longer knows ends the
 * session; a forum, which takes no message outside a post, opens a session of
 * its own. The sessions' buttons are in discordSessions.ts.
 *
 * A webhook Discord no longer knows (404) or whose token it refuses (401) is
 * removed from the characters and the parties that have it, so that it is
 * not called again on every roll.
 *
 * A check or a saving throw made in DiceCloud carries the buttons of D7,
 * "Reroll with advantage / disadvantage", on the webhooks DiceCloud's
 * application owns (connected, or made by the bot with /connect) when the
 * application takes interactions: never on a pasted webhook, which Discord
 * refuses them from. Who may click is checked at the click.
 */

// What this reads of a party's folder (CreatureFolders.js)
export type PartyFolderDoc = {
  _id: string,
  name?: string,
  owner?: string,
  members?: string[],
  creatures?: string[],
  initiative?: {
    round?: number,
    turn?: number,
    entries?: { _id: string, creatureId?: string, name?: string, initiative?: number, bonus?: number, out?: boolean }[],
  },
  discord?: PartyDiscord & {
    channel?: DiscordChannel,
    webhookChannelKind?: ChannelKind,
    session?: DiscordSession,
    sessionHistory?: PastSession[],
    initiative?: { webhookId: string, messageId: string, threadId?: string },
  },
};

/**
 * The folders collection, imported when used: the folders' methods import
 * the logs, which import this
 */
export async function creatureFolders() {
  const { default: CreatureFolders } = await import('/imports/api/creature/creatureFolders/CreatureFolders');
  return CreatureFolders as unknown as Mongo.Collection<PartyFolderDoc>;
}

/**
 * Removes a webhook from every character and party that has it (several
 * characters of a table often share one), with their sessions: pasted, or
 * connected (D4), then forgotten by the server too. Returns how many there
 * were. A pasted one goes only where it is the same URL, token included: a
 * wrong token pasted elsewhere never removes the right one
 */
export async function forgetWebhook(webhook: Webhook, status: number): Promise<number> {
  const connected = await forgetConnectedWebhook(webhook.id);
  // By the webhook's id, then the token, which is sealed; a plaintext URL
  // whose id the startup job has not filled in yet (pastedWebhooks.ts) by
  // the URL itself
  const inUrl = new RegExp(`/${escapeRegExp(webhook.id)}/`);
  const creatureIds = (await Creatures.find(
    { $or: [{ discordWebhookId: webhook.id }, { discordWebhookId: { $exists: false }, 'settings.discordWebhook': inUrl }] },
    { fields: { _id: 1, 'settings.discordWebhook': 1 } },
  ).fetchAsync()).filter(creature => isPastedWebhook(creature.settings?.discordWebhook, webhook)).map(creature => creature._id);
  const count = creatureIds.length ? await Creatures.updateAsync(
    { _id: { $in: creatureIds } },
    {
      $unset: {
        'settings.discordWebhook': 1, discordWebhookId: 1, discordWebhookChannelId: 1, discordWebhookChannelKind: 1, discordSession: 1,
      },
    },
    { multi: true },
  ) : 0;
  const CreatureFolders = await creatureFolders();
  const folderIds = (await CreatureFolders.find(
    { $or: [{ 'discord.webhookId': webhook.id }, { 'discord.webhookId': { $exists: false }, 'discord.webhook': inUrl }] },
    { fields: { _id: 1, 'discord.webhook': 1 } },
  ).fetchAsync()).filter(folder => isPastedWebhook(folder.discord?.webhook, webhook)).map(folder => folder._id);
  const parties = folderIds.length ? await CreatureFolders.updateAsync(
    { _id: { $in: folderIds } },
    { $unset: { discord: 1, discordPosting: 1 } },
    { multi: true },
  ) : 0;
  console.warn(`Discord webhook ${webhook.id} answered ${status}: removed from ${count + connected} character(s) or part(ies)`
    + `${parties ? ` and ${parties} part(ies)` : ''}`);
  return count + parties + connected;
}

// What a channel is: a text channel, or a forum
export type ChannelKind = 'text' | 'forum';

// A webhook, and the channel it posts in when DiceCloud knows it (connected),
// and its server; what that channel is, when known (connected: a text
// channel unless /connect said a forum); whether it was pasted
export type Destination = Webhook & { channelId?: string, guildId?: string, kind?: ChannelKind, pasted?: boolean };

// A connected channel's webhook, and what the channel is
async function connectedDestination(channel: DiscordChannel): Promise<Destination | undefined> {
  const webhook = await connectedWebhook(channel.webhookId);
  return webhook && { ...webhook, kind: channel.kind ?? 'text' };
}

// A pasted webhook, with its channel and what it is once known
function pastedDestination(stored: string | undefined, channelId?: string, kind?: ChannelKind): Destination | undefined {
  const webhook = pastedWebhook(stored);
  return webhook && { ...webhook, ...channelId && { channelId }, ...kind && { kind }, pasted: true };
}

/**
 * The webhook a character posts with: its connected channel's, else its
 * pasted URL's (sealed or not), with its channel once Discord said
 */
export async function characterWebhook(creature: {
  discordChannel?: DiscordChannel, settings?: { discordWebhook?: string }, discordWebhookChannelId?: string,
  discordWebhookChannelKind?: ChannelKind,
}): Promise<Destination | undefined> {
  if (creature?.discordChannel?.webhookId) return connectedDestination(creature.discordChannel);
  return pastedDestination(creature?.settings?.discordWebhook, creature?.discordWebhookChannelId, creature?.discordWebhookChannelKind);
}

/** The webhook a party posts with: its connected channel's, else its pasted URL's (sealed or not) */
export async function partyWebhook(discord?: PartyFolderDoc['discord']): Promise<Destination | undefined> {
  if (discord?.channel?.webhookId) return connectedDestination(discord.channel);
  return pastedDestination(discord?.webhook, discord?.webhookChannelId, discord?.webhookChannelKind);
}

/**
 * Where messages land, to post once there (D2): the channel, when DiceCloud
 * knows it, else the webhook
 */
export const destinationKey = (destination: Destination) => destination.channelId
  ? `channel:${destination.channelId}` : `webhook:${destination.id}`;

/**
 * Whether two webhooks post to the same place (D2): the same webhook, or the
 * same channel when DiceCloud knows both (a pasted webhook's once Discord
 * said, D6). One of two holders of one webhook may know its channel already
 */
export const sameDestination = (a: Destination, b: Destination) => a.id === b.id || (!!a.channelId && a.channelId === b.channelId);

// A channel's webhook, as a destination
const destinationOf = (channel: Channel): Destination => ({ ...channel.webhook, ...channel.channelId && { channelId: channel.channelId } });

function defaultSender(): WebhookSender | undefined {
  const baseUrl = discordApiBase();
  if (baseUrl && baseUrl !== DISCORD_API) console.warn(`Discord webhooks are sent to ${baseUrl} (${TEST_API_VARIABLE})`);
  return baseUrl ? createWebhookSender({
    baseUrl,
    userAgent: discordUserAgent(Meteor.absoluteUrl(), VERSION),
    onGone: forgetWebhook,
  }) : undefined;
}

let sender: WebhookSender | undefined | null = null;

/** The sender every Discord message goes through; none under tests without the fake */
export function webhookSender(): WebhookSender | undefined {
  if (sender === null) sender = defaultSender();
  return sender;
}

/**
 * Replaces the sender the log uses, for a test; returns the one it replaced.
 * Refused outside tests.
 */
export function setWebhookSender(replacement: WebhookSender | undefined) {
  if (!Meteor.isTest && !Meteor.isAppTest) throw new Meteor.Error('test-only', 'Only tests replace the webhook sender');
  const previous = sender ?? undefined;
  sender = replacement;
  return previous;
}

// ---------------------------------------------------------------- channels and sessions

// Whose session a webhook's messages follow: a character's, or a party's
export type Holder = { creatureId: string } | { folderId: string };

/** Where a message goes: a webhook, its holder, and how its messages read */
export type Channel = {
  webhook: Webhook,
  // Where it posts, once per message (destinationKey)
  key?: string,
  // The Discord channel it posts in, when known: connected, or a pasted
  // webhook's once Discord said; and its server, when connected
  channelId?: string,
  guildId?: string,
  holder: Holder,
  // The language of the channel's owner: the character's, the game master's
  language: DiscordLanguage,
  // What its sessions are named after: the character, the party
  label: string,
  // The author of a session's header: the character, or the webhook itself
  author?: { username?: string, avatar_url?: string },
  // false when its game master turned the party's sessions off: its messages
  // go to the channel
  sessions?: boolean,
  // What the channel is, when known; whether its webhook was pasted
  channelKind?: ChannelKind,
  pasted?: boolean,
};

// What a channel's destination says of the channel
const channelFacts = (webhook: Destination) => ({
  ...webhook.channelId && { channelId: webhook.channelId },
  ...webhook.guildId && { guildId: webhook.guildId },
  ...webhook.kind && { channelKind: webhook.kind },
  ...webhook.pasted && { pasted: true },
});

/** A user's interface language, which their channels' messages are written in */
export async function languageOf(userId?: string): Promise<DiscordLanguage> {
  if (!userId) return 'en';
  const user = await Meteor.users.findOneAsync(userId, { fields: { 'preferences.language': 1 } });
  return discordLanguage((user as { preferences?: { language?: string } } | undefined)?.preferences?.language);
}

/**
 * The party's channel, from its folder: the game master's language, the
 * party's name, and its sessions unless the game master turned them off
 */
export async function partyChannel(folder: Pick<PartyFolderDoc, '_id' | 'name' | 'owner' | 'discord'>, webhook: Destination): Promise<Channel> {
  const language = await languageOf(folder.owner);
  return {
    webhook: { id: webhook.id, token: webhook.token },
    key: destinationKey(webhook),
    ...channelFacts(webhook),
    holder: { folderId: folder._id },
    language,
    label: folder.name?.trim() || translatorFor(language)('party.untitled', {}) || '',
    sessions: publishes(folder.discord, 'sessions'),
  };
}

export { destinationOf };

/** A character's own channel: its owner's language, its name and picture */
export async function characterChannel(creature: {
  _id: string, name?: string, owner?: string, avatarPicture?: string,
}, webhook: Destination): Promise<Channel> {
  const username = webhookUsername(creature.name);
  return {
    webhook: { id: webhook.id, token: webhook.token },
    key: destinationKey(webhook),
    ...channelFacts(webhook),
    holder: { creatureId: creature._id },
    language: await languageOf(creature.owner),
    label: creature.name?.trim() || '',
    author: {
      ...username && { username },
      ...creature.avatarPicture && /^https?:\/\//i.test(creature.avatarPicture) && { avatar_url: creature.avatarPicture },
    },
  };
}

/** The holder's session, whichever webhook it was opened on */
export async function readSession(holder: Holder): Promise<DiscordSession | undefined> {
  if ('creatureId' in holder) {
    return (await Creatures.findOneAsync(holder.creatureId, { fields: { discordSession: 1 } }))?.discordSession as DiscordSession | undefined;
  }
  const CreatureFolders = await creatureFolders();
  return (await CreatureFolders.findOneAsync(holder.folderId, { fields: { 'discord.session': 1 } }))?.discord?.session;
}

/**
 * Sets the holder's session, or ends it. Ending a given session leaves a
 * newer one alone
 */
export async function writeSession(holder: Holder, session: DiscordSession | undefined, ending?: DiscordSession, {
  closed = false,
}: { closed?: boolean } = {}) {
  const field = 'creatureId' in holder ? 'discordSession' : 'discord.session';
  const notice = 'creatureId' in holder ? 'discordSessionClosed' : 'discord.sessionClosed';
  const selector: Record<string, unknown> = {
    _id: 'creatureId' in holder ? holder.creatureId : holder.folderId,
    ...ending && { [`${field}.startedAt`]: ending.startedAt },
  };
  // A new session takes the notice of the last one's thread away; a session
  // whose thread closed leaves it
  const modifier = session ? { $set: { [field]: session }, $unset: { [notice]: 1 as const } }
    : closed ? { $unset: { [field]: 1 as const }, $set: { [notice]: { ...ending?.name && { name: ending.name }, at: new Date() } } }
      : { $unset: { [field]: 1 as const } };
  if ('creatureId' in holder) {
    await Creatures.updateAsync(selector, modifier);
  } else {
    const CreatureFolders = await creatureFolders();
    await CreatureFolders.updateAsync(selector, modifier);
  }
}

/** The holder's last sessions, newest first */
export async function readPastSessions(holder: Holder): Promise<PastSession[]> {
  if ('creatureId' in holder) {
    const creature = await Creatures.findOneAsync(holder.creatureId, { fields: { discordSessionHistory: 1 } });
    return (creature as { discordSessionHistory?: PastSession[] } | undefined)?.discordSessionHistory ?? [];
  }
  const CreatureFolders = await creatureFolders();
  return (await CreatureFolders.findOneAsync(holder.folderId, { fields: { 'discord.sessionHistory': 1 } }))?.discord?.sessionHistory ?? [];
}

/** Sets the holder's last sessions */
async function writePastSessions(holder: Holder, history: PastSession[]) {
  if ('creatureId' in holder) {
    await Creatures.updateAsync(holder.creatureId, { $set: { discordSessionHistory: history } });
  } else {
    const CreatureFolders = await creatureFolders();
    await CreatureFolders.updateAsync(holder.folderId, { $set: { 'discord.sessionHistory': history } });
  }
}

/**
 * Keeps a session DiceCloud opened (a forum post, the bot's thread) first in
 * the holder's last sessions, or puts a resumed one first again
 */
export async function rememberSession(channel: Channel, session: DiscordSession) {
  if (!session.threadId || (session.kind !== 'forum' && session.kind !== 'thread')) return;
  const history = await readPastSessions(channel.holder);
  const known = history.find(past => past.threadId === session.threadId);
  const past: PastSession = known ?? {
    threadId: session.threadId,
    kind: session.kind,
    ...session.name && { name: session.name },
    ...channel.channelId && { channelId: channel.channelId },
    webhookId: channel.webhook.id,
    startedAt: session.startedAt,
  };
  await writePastSessions(channel.holder, withPastSession(history, past));
}

/** Takes a session out of the holder's last sessions: its thread is gone */
export async function forgetPastSession(holder: Holder, threadId: string) {
  const history = await readPastSessions(holder);
  if (history.some(past => past.threadId === threadId)) {
    await writePastSessions(holder, history.filter(past => past.threadId !== threadId));
  }
}

// Discord's answers to a message for a thread that can no longer take it: a
// deleted one. A webhook's message reopens an archived thread and still goes
// into a locked one (checked by hand on 2026-10-11); their codes stay here in
// case Discord changes that
const THREAD_CLOSED_CODES: number[] = [DISCORD_CODES.unknownChannel, 50083, 160005];

export type SessionResult = { session?: DiscordSession, result: DiscordResult };

/**
 * Opens a session on the channel's webhook in a forum channel: a post of its
 * own, named after the date and the holder. A text channel refuses it (the
 * webhook only creates threads in a forum: 220003), which `textChannel`
 * says: its sessions are threads the bot creates (discordSessions.ts). The
 * holder keeps the session, and the post among its last sessions; the result
 * says what Discord answered
 */
export async function openSession(request: Requester, channel: Channel, {
  date = new Date(), timeZone,
}: { date?: Date, timeZone?: string } = {}): Promise<SessionResult & { textChannel?: boolean }> {
  const name = sessionName({ label: channel.label, date, language: channel.language, timeZone });
  const result = await postMessage(request, {
    body: { ...sessionHeader(name, channel.author), thread_name: name.slice(0, THREAD_NAME_LENGTH) }, wait: true,
  });
  if (!result.ok) return { result, ...result.code === DISCORD_CODES.threadsOnlyInForums && { textChannel: true } };
  const message = result.message;
  // A forum's new post: the message's channel is its thread
  const threadId = message?.channel_id;
  if (!threadId) return { result };
  const session: DiscordSession = {
    webhookId: channel.webhook.id,
    kind: 'forum',
    threadId,
    ...message?.id && { messageId: message.id },
    name,
    startedAt: date,
  };
  await writeSession(channel.holder, session);
  await rememberSession(channel, session);
  return { session, result };
}

/**
 * Opens a session in a thread of the channel's webhook: the thread the bot
 * just created for it, or the thread or forum post of a session resumed. Only
 * if Discord takes the message there (`body`: the session's header, or "The
 * session goes on") and says it went into that thread; a thread a webhook's
 * message reaches is reopened if it was archived. The holder keeps the
 * session, first of its last sessions
 */
export async function openInThread(request: Requester, channel: Channel, { threadId, kind, name, body, date = new Date() }: {
  threadId: string, kind: 'thread' | 'forum', name?: string, body: Record<string, unknown>, date?: Date,
}): Promise<SessionResult & { refused?: boolean }> {
  const result = await postMessage(request, { body, threadId, wait: true });
  if (!result.ok) return { result };
  if (result.message?.channel_id !== threadId) {
    return { refused: true, result: { ok: false, fields: [], detail: 'not posted in that thread' } };
  }
  const session: DiscordSession = {
    webhookId: channel.webhook.id,
    kind,
    threadId,
    ...result.message?.id && { messageId: result.message.id },
    ...name && { name },
    startedAt: date,
  };
  await writeSession(channel.holder, session);
  await rememberSession(channel, session);
  return { session, result };
}

// A refusal of a message for a thread of a text channel: Discord's codes for a
// thread that is gone are not all known, so any client error but a rate
// limit; whether the message itself was the matter is told
// by the channel taking it
export const refusedInThread = (result: DiscordResult) => !result.ok && !result.gone
  && result.status !== undefined && result.status >= 400 && result.status < 500 && result.status !== 429;

/**
 * Posts a message on the channel, in its session if one is open: its forum
 * post or its thread, else the channel. Its fallback is the embeds of a card
 * Discord does not take. A thread that no longer takes messages ends its
 * session, once: the message and the next ones go to the channel, and the
 * holder keeps a notice of it. Returns Discord's answer, and the thread it
 * went into
 */
export async function deliver(request: Requester, channel: Channel, message: {
  body: Record<string, unknown>,
  fallback?: Record<string, unknown>[],
  wait?: boolean,
}): Promise<DiscordResult & { threadId?: string }> {
  const sessions = channel.sessions !== false;
  let session = sessions ? sessionOf(await readSession(channel.holder), channel.webhook.id) : undefined;
  let result = await postMessage(request, { ...message, threadId: session?.threadId });
  const closedCode = !result.ok && result.code !== undefined && THREAD_CLOSED_CODES.includes(result.code);
  if (!result.ok && session?.threadId && closedCode) {
    // Its post is gone: the session is over, the channel takes the message
    console.warn(`Discord webhook ${channel.webhook.id}: the session's thread is closed (${result.code}), session ended`);
    await writeSession(channel.holder, undefined, session, { closed: session.kind === 'thread' });
    session = undefined;
    result = await postMessage(request, message);
  } else if (session?.kind === 'thread' && refusedInThread(result)) {
    // A thread of a text channel refusing it: if the channel takes it, the
    // thread was the matter, and the session ends
    const inChannel = await postMessage(request, message);
    if (inChannel.ok) {
      console.warn(`Discord webhook ${channel.webhook.id}: the session's thread refused a message (${result.ok ? '' : result.status}), session ended`);
      await writeSession(channel.holder, undefined, session, { closed: true });
      session = undefined;
    }
    result = inChannel;
  }
  if (!result.ok && result.code === DISCORD_CODES.forumNeedsThread && sessions) {
    // A forum takes no message outside a post: a session opens by itself
    session = (await openSession(request, channel)).session;
    if (session?.threadId) result = await postMessage(request, { ...message, threadId: session.threadId });
  }
  return { ...result, ...result.ok && session?.threadId && { threadId: session.threadId } };
}

// How long a session's button waits for Discord: the session still opens
// later if Discord is slower (rate limits)
const SESSION_WAIT_MS = 20 * 1000;

/**
 * Runs a task on the channel's webhook now, for the sessions' buttons:
 * through the webhook's queue, after what it already holds. Resolves with
 * what the task returns, or throws an error the interface can show
 * (boardError, `discord.errors.*`): nothing posts to Discord, the webhook is
 * gone, Discord is slow (the task still runs)
 */
export async function inSessionQueue<T>(channel: Channel, task: (request: Requester) => Promise<T>): Promise<T> {
  const target = webhookSender();
  if (!target) throw boardError('discord.unavailable', 'discord.errors.unavailable');
  if (target.isGone(channel.webhook)) throw boardError('discord.gone', 'discord.errors.gone');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<'late'>(resolve => {
    timer = setTimeout(() => resolve('late'), SESSION_WAIT_MS);
  });
  const done = await Promise.race([target.enqueue(channel.webhook, task), late]);
  clearTimeout(timer);
  if (done === 'late') throw boardError('discord.late', 'discord.errors.late');
  return done as T;
}

/** The error a session's button shows for Discord's refusal */
export function sessionFailure(result: DiscordResult | undefined) {
  if (!result || (!result.ok && result.gone)) return boardError('discord.gone', 'discord.errors.gone');
  return boardError('discord.failed', 'discord.errors.failed', { status: statusOf(result) });
}

/** "403 50013": Discord's status and code, for an error's text */
export function statusOf(result: { ok: boolean, status?: number, code?: number }): string {
  if (result.ok) return String(result.status ?? '');
  return `${result.status ?? '–'}${result.code ? ` ${result.code}` : ''}`;
}

// ---------------------------------------------------------------- the log

type LogEntry = { creatureId?: string, content?: LogLine[], date?: Date | string };

// The check or saving throw an entry rolled, which the buttons roll again
export type RolledCheck = { skillVariableName?: string, abilityVariableName?: string };

/** Whether a channel's messages may carry the buttons of D7: its webhook is the application's, which takes interactions */
const takesButtons = (channel: Channel) => !channel.pasted && !!interactionsPublicKey();

// A variable's name as the check's decision gave it (the client's): kept only if it is one
const variableName = (name: unknown) => typeof name === 'string' && /^[\w~#]{1,64}$/.test(name) ? name : undefined;

/** The check to keep for the buttons, its variables' names checked; none without one */
function rerollOf(reroll?: RolledCheck): RolledCheck | undefined {
  const skillVariableName = variableName(reroll?.skillVariableName);
  const abilityVariableName = variableName(reroll?.abilityVariableName);
  if (!skillVariableName && !abilityVariableName) return undefined;
  return { ...skillVariableName && { skillVariableName }, ...abilityVariableName && { abilityVariableName } };
}

type LogCreature = {
  _id: string, name?: string, color?: string, picture?: string, avatarPicture?: string,
  owner?: string, type?: string, settings?: { discordWebhook?: string }, discordChannel?: DiscordChannel,
  discordWebhookChannelId?: string,
};

/**
 * Where a character's log goes: the webhook of each party it plays in, then
 * its own, once per channel (or per webhook, where the channel is unknown)
 */
export async function logChannels(creature: LogCreature): Promise<Channel[]> {
  const channels: Channel[] = [];
  const known = (destination: Destination) => channels.some(channel => sameDestination(destinationOf(channel), destination));
  // Not the game master's monsters and non-player characters, which nothing
  // public shows: neither their stats nor their rolls. That is their owner's
  // to decide, not their type's (hidesStatsFromPlayers): a player's monster in
  // the party posts like their characters
  const CreatureFolders = await creatureFolders();
  const parties = await CreatureFolders.find(
    {
      creatures: creature._id,
      $or: [{ 'discord.webhook': { $exists: true } }, { 'discord.channel.webhookId': { $exists: true } }],
    },
    {
      fields: {
        name: 1, owner: 1, members: 1, 'discord.webhook': 1, 'discord.webhookId': 1, 'discord.webhookChannelId': 1,
        'discord.channel': 1, 'discord.enabled': 1, 'discord.publish': 1,
      },
    },
  ).fetchAsync();
  for (const party of parties) {
    if (hidesStatsFromPlayers(creature, party.owner)) continue;
    // The table's characters only: the game master's and the players'.
    // Another's character the game master put in the folder never joined
    if (![party.owner, ...party.members || []].includes(creature.owner)) continue;
    // Unless the game master turned the party's rolls off: then the
    // character's own webhook, if it is the same, posts as its own
    if (!publishes(party.discord, 'rolls')) continue;
    const webhook = await partyWebhook(party.discord);
    if (webhook && !known(webhook)) channels.push(await partyChannel(party, webhook));
  }
  const own = await characterWebhook(creature);
  if (own && !known(own)) channels.push(await characterChannel(creature, own));
  return channels;
}

// Of the creatures a log entry acted on, those of a game master whose stats
// the players never see: monsters and non-player characters, unless the
// creature that acted is one of the same owner's (hiddenFrom)
async function hiddenTargets(creature: LogCreature, log: LogEntry): Promise<string[]> {
  const targetIds = uniq((log.content || []).flatMap(line => line?.targetIds || []))
    .filter(id => id !== creature._id);
  if (!targetIds.length) return [];
  const targets = await Creatures.find(
    { _id: { $in: targetIds }, type: { $in: [...GM_CREATURE_TYPES] } }, { fields: { type: 1, owner: 1 } },
  ).fetchAsync() as { _id: string, type?: string, owner?: string }[];
  return targets.filter(target => hiddenFrom(creature, target)).map(target => target._id);
}

// One lookup at a time per character: its entries keep their order
const intake = new Map<string, Promise<void>>();

/**
 * Where a channel's next message lands: its session's post, else the channel
 * itself, when known (a pasted webhook's is asked of Discord once)
 */
async function landingChannel(request: Requester, channel: Channel): Promise<string | undefined> {
  const session = channel.sessions !== false ? sessionOf(await readSession(channel.holder), channel.webhook.id) : undefined;
  if (session?.threadId) return session.threadId;
  if (!channel.channelId) channel.channelId = await learnPastedChannel(channel.holder, channel.webhook, request);
  return channel.channelId;
}

// What the channels of a creature's log read of it
const LOG_CREATURE_FIELDS = {
  name: 1, color: 1, picture: 1, avatarPicture: 1, owner: 1, type: 1, 'settings.discordWebhook': 1, discordChannel: 1,
  discordWebhookChannelId: 1,
};

/**
 * Where a creature's log goes, but where the log of `besides` goes too: an
 * entry that tells what another's action did to the creature posts where
 * that action's own entry does not, once in a party's channel (2.1). A game
 * master's monster posts in none of its party's, its target's entry does
 */
async function channelsBesides(channels: Channel[], besides?: string): Promise<Channel[]> {
  if (!besides) return channels;
  const other = await Creatures.findOneAsync(besides, { fields: LOG_CREATURE_FIELDS }) as LogCreature | undefined;
  if (!other) return channels;
  const theirs = await logChannels(other);
  return channels.filter(channel => !theirs.some(their => sameDestination(destinationOf(their), destinationOf(channel))));
}

async function queueLog(
  creatureId: string, log: LogEntry, target: WebhookSender, repliedIn?: string, reroll?: RolledCheck, besides?: string,
) {
  const creature = await Creatures.findOneAsync(creatureId, { fields: LOG_CREATURE_FIELDS }) as LogCreature | undefined;
  if (!creature) return;
  const channels = (await channelsBesides(await logChannels(creature), besides))
    .filter(channel => !target.isGone(channel.webhook));
  if (!channels.length) return;
  const hiddenIds = await hiddenTargets(creature, log);
  const sheetUrl = Meteor.absoluteUrl(`character/${creature._id}`);
  // A check rolled again from the buttons: kept once for all the channels that take them
  const rolled = rerollOf(reroll);
  const rerollId = rolled && channels.some(takesButtons)
    ? await saveReroll({ creatureId: creature._id, kind: 'check', ...rolled, secret: false })
    : undefined;
  for (const channel of channels) {
    const input = { log, creature, language: channel.language, sheetUrl, hiddenIds };
    const embeds = discordMessages(input);
    if (!embeds.length) continue;
    const card = logComponents(input);
    if (card && rerollId && takesButtons(channel)) addButtons(card, rerollButtonsOf(rerollId, channel.language));
    void target.enqueue(channel.webhook, async request => {
      // A command's entry: its reply is in that channel already (D6)
      if (repliedIn && await landingChannel(request, channel) === repliedIn) return;
      // The card, or the embeds when Discord does not take it; the embeds
      // alone for an entry too long for a card
      const parts = card ? [{ body: card, fallback: embeds }] : embeds.map(body => ({ body }));
      for (const part of parts) {
        const result = await deliver(request, channel, part);
        if (!result.ok) {
          if (!result.gone) {
            console.warn(`Discord webhook ${channel.webhook.id}: message dropped, ${result.status ?? 'no answer'}: ${result.detail}`);
          }
          return;
        }
      }
    });
  }
}

/**
 * Posts a log entry to its character's Discord webhooks, if it has some.
 * Returns at once: a log never waits on Discord. Once per entry, after it is
 * written; with the check or saving throw it rolled, its buttons (D7); not
 * where the log of `besides` goes (channelsBesides)
 */
export function sendLogToDiscord(log: LogEntry, { reroll, besides }: { reroll?: RolledCheck, besides?: string } = {}) {
  // Written by a Discord command (D6): its reply shows it in that channel
  const origin = interactionOrigin();
  origin?.logs.push(log);
  // A secret command's: its user alone sees it, no webhook posts it anywhere
  if (origin?.secret) return;
  const target = webhookSender();
  const creatureId = log?.creatureId;
  if (!target || !creatureId) return;
  const repliedIn = origin?.channelId;
  const next = (intake.get(creatureId) ?? Promise.resolve())
    .then(() => queueLog(creatureId, log, target, repliedIn, reroll, besides))
    .catch(e => console.error(e));
  intake.set(creatureId, next);
  void next.finally(() => {
    if (intake.get(creatureId) === next) intake.delete(creatureId);
  });
}

/** Resolves once the entries logged so far are queued (for tests) */
export async function discordIntakeIdle() {
  while (intake.size) await Promise.all([...intake.values()]);
}

// In development only: where the server posts, when it is a local fake of
// Discord (TEST_API_VARIABLE), for the browser checks (tests/e2e, check
// discord-webhook). They set a webhook Discord could take only once the
// server says it posts to their fake: never anything to Discord itself. A
// production server has no such method
if (Meteor.isDevelopment) {
  Meteor.methods({
    'discord.testApi'() {
      const base = discordApiBase();
      return base && base !== DISCORD_API ? base : null;
    },
  });
}
