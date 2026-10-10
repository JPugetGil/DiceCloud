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
import { sessionOf, type DiscordSession, type SessionKind } from '/imports/api/creature/log/discord/discordSession';
import { parseWebhookURL, type Webhook } from '/imports/api/creature/log/discord/webhookUrl';
import { publishes, type PartyDiscord } from '/imports/api/creature/log/discord/partyPublishing';
import { hidesStatsFromPlayers, boardError, GM_CREATURE_TYPES } from '/imports/api/creature/creatureFolders/boardMonsters';
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
 * when the message leaves: the forum post of the session, or the channel. A
 * session's post that Discord no longer knows ends the session; a forum,
 * which takes no message outside a post, opens a session of its own.
 *
 * A webhook Discord no longer knows (404) or whose token it refuses (401) is
 * removed from the characters and the parties that have it, so that it is
 * not called again on every roll.
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
    session?: DiscordSession,
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
 * characters of a table often share one), with their sessions. Returns how
 * many there were.
 */
export async function forgetWebhook(webhook: Webhook, status: number): Promise<number> {
  const url = new RegExp(`/${escapeRegExp(webhook.id)}/${escapeRegExp(webhook.token)}(?:[/?#]|$)`);
  const count = await Creatures.updateAsync(
    { 'settings.discordWebhook': url },
    { $unset: { 'settings.discordWebhook': 1, discordSession: 1 } },
    { multi: true },
  );
  const CreatureFolders = await creatureFolders();
  const parties = await CreatureFolders.updateAsync(
    { 'discord.webhook': url },
    { $unset: { discord: 1, discordPosting: 1 } },
    { multi: true },
  );
  console.warn(`Discord webhook ${webhook.id} answered ${status}: removed from ${count} character(s) and ${parties} part(ies)`);
  return count + parties;
}

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
};

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
export async function partyChannel(folder: Pick<PartyFolderDoc, '_id' | 'name' | 'owner' | 'discord'>, webhook: Webhook): Promise<Channel> {
  const language = await languageOf(folder.owner);
  return {
    webhook,
    holder: { folderId: folder._id },
    language,
    label: folder.name?.trim() || translatorFor(language)('party.untitled', {}) || '',
    sessions: publishes(folder.discord, 'sessions'),
  };
}

/** A character's own channel: its owner's language, its name and picture */
export async function characterChannel(creature: {
  _id: string, name?: string, owner?: string, avatarPicture?: string,
}, webhook: Webhook): Promise<Channel> {
  const username = webhookUsername(creature.name);
  return {
    webhook,
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
export async function writeSession(holder: Holder, session: DiscordSession | undefined, ending?: DiscordSession) {
  const field = 'creatureId' in holder ? 'discordSession' : 'discord.session';
  const selector: Record<string, unknown> = {
    _id: 'creatureId' in holder ? holder.creatureId : holder.folderId,
    ...ending && { [`${field}.startedAt`]: ending.startedAt },
  };
  const modifier = session ? { $set: { [field]: session } } : { $unset: { [field]: 1 as const } };
  if ('creatureId' in holder) {
    await Creatures.updateAsync(selector, modifier);
  } else {
    const CreatureFolders = await creatureFolders();
    await CreatureFolders.updateAsync(selector, modifier);
  }
}

// Discord's answers to a message for a thread that can no longer take it:
// deleted, archived for good, locked
const THREAD_CLOSED_CODES: number[] = [DISCORD_CODES.unknownChannel, 50083, 160005];

export type SessionResult = { session?: DiscordSession, result: DiscordResult };

/**
 * Opens a session on the channel's webhook: a post in a forum channel, named
 * after the date and the holder; in a text channel, where Discord answers
 * that a webhook only opens threads in forums (220003), a header message.
 * The holder keeps it; the result says what Discord answered
 */
export async function openSession(request: Requester, channel: Channel, {
  date = new Date(), timeZone,
}: { date?: Date, timeZone?: string } = {}): Promise<SessionResult> {
  const name = sessionName({ label: channel.label, date, language: channel.language, timeZone });
  const header = sessionHeader(name, channel.author);
  let kind: SessionKind = 'forum';
  let result = await postMessage(request, {
    body: { ...header, thread_name: name.slice(0, THREAD_NAME_LENGTH) }, wait: true,
  });
  if (!result.ok && result.code === DISCORD_CODES.threadsOnlyInForums) {
    kind = 'channel';
    result = await postMessage(request, { body: header, wait: true });
  }
  if (!result.ok) return { result };
  const message = result.message;
  // A forum's new post: the message's channel is its thread
  const threadId = kind === 'forum' ? message?.channel_id : undefined;
  if (kind === 'forum' && !threadId) return { result };
  const session: DiscordSession = {
    webhookId: channel.webhook.id,
    kind,
    ...threadId && { threadId },
    ...message?.id && { messageId: message.id },
    name,
    startedAt: date,
  };
  await writeSession(channel.holder, session);
  return { session, result };
}

/**
 * Posts a message on the channel, in its session if one is open: its forum
 * post, else the channel. Its fallback is the embeds of a card Discord does
 * not take. Returns Discord's answer, and the thread it went into
 */
export async function deliver(request: Requester, channel: Channel, message: {
  body: Record<string, unknown>,
  fallback?: Record<string, unknown>[],
  wait?: boolean,
}): Promise<DiscordResult & { threadId?: string }> {
  const sessions = channel.sessions !== false;
  let session = sessions ? sessionOf(await readSession(channel.holder), channel.webhook.id) : undefined;
  let result = await postMessage(request, { ...message, threadId: session?.threadId });
  if (!result.ok && session?.threadId && result.code !== undefined && THREAD_CLOSED_CODES.includes(result.code)) {
    // Its post is gone: the session is over, the channel takes the message
    console.warn(`Discord webhook ${channel.webhook.id}: the session's thread is closed (${result.code}), session ended`);
    await writeSession(channel.holder, undefined, session);
    session = undefined;
    result = await postMessage(request, message);
  }
  if (!result.ok && result.code === DISCORD_CODES.forumNeedsThread && sessions) {
    // A forum takes no message outside a post: a session opens by itself
    session = (await openSession(request, channel)).session;
    if (session?.threadId) result = await postMessage(request, { ...message, threadId: session.threadId });
  }
  return { ...result, ...result.ok && session?.threadId && { threadId: session.threadId } };
}

// How long a "New session" button waits for Discord: the session still opens
// later if Discord is slower (rate limits)
const SESSION_WAIT_MS = 20 * 1000;

/**
 * Opens a session on the channel now, for the "New session" buttons: through
 * the webhook's queue, after what it already holds. Resolves with the session,
 * or throws an error the interface can show (boardError, `discord.errors.*`)
 */
export async function startSession(channel: Channel, timeZone?: string): Promise<DiscordSession> {
  const target = webhookSender();
  if (!target) throw boardError('discord.unavailable', 'discord.errors.unavailable');
  if (target.isGone(channel.webhook)) throw boardError('discord.gone', 'discord.errors.gone');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<'late'>(resolve => {
    timer = setTimeout(() => resolve('late'), SESSION_WAIT_MS);
  });
  const opened = await Promise.race([
    target.enqueue(channel.webhook, request => openSession(request, channel, { timeZone })),
    late,
  ]);
  clearTimeout(timer);
  if (opened === 'late') throw boardError('discord.late', 'discord.errors.late');
  if (opened?.session) return opened.session;
  const result = opened?.result;
  if (!result || (!result.ok && result.gone)) throw boardError('discord.gone', 'discord.errors.gone');
  throw boardError('discord.failed', 'discord.errors.failed', { status: result.ok ? result.status : result.status ?? '–' });
}

// ---------------------------------------------------------------- the log

type LogEntry = { creatureId?: string, content?: LogLine[], date?: Date | string };

type LogCreature = {
  _id: string, name?: string, color?: string, picture?: string, avatarPicture?: string,
  owner?: string, type?: string, settings?: { discordWebhook?: string },
};

/**
 * Where a character's log goes: the webhook of each party it plays in, then
 * its own, once per webhook
 */
export async function logChannels(creature: LogCreature): Promise<Channel[]> {
  const channels: Channel[] = [];
  const known = (webhook: Webhook) => channels.some(channel => channel.webhook.id === webhook.id);
  if (!hidesStatsFromPlayers(creature)) {
    const CreatureFolders = await creatureFolders();
    const parties = await CreatureFolders.find(
      { creatures: creature._id, 'discord.webhook': { $exists: true } },
      { fields: { name: 1, owner: 1, members: 1, 'discord.webhook': 1, 'discord.enabled': 1, 'discord.publish': 1 } },
    ).fetchAsync();
    for (const party of parties) {
      // The table's characters only: the game master's and the players'.
      // Another's character the game master put in the folder never joined
      if (![party.owner, ...party.members || []].includes(creature.owner)) continue;
      // Unless the game master turned the party's rolls off: then the
      // character's own webhook, if it is the same, posts as its own
      if (!publishes(party.discord, 'rolls')) continue;
      const webhook = parseWebhookURL(party.discord?.webhook);
      if (webhook && !known(webhook)) channels.push(await partyChannel(party, webhook));
    }
  }
  const own = parseWebhookURL(creature.settings?.discordWebhook);
  if (own && !known(own)) channels.push(await characterChannel(creature, own));
  return channels;
}

// Of the creatures a log entry acted on, those of a game master whose stats
// the players never see: monsters and non-player characters
async function hiddenTargets(creature: LogCreature, log: LogEntry): Promise<string[]> {
  if (hidesStatsFromPlayers(creature)) return [];
  const targetIds = uniq((log.content || []).flatMap(line => line?.targetIds || []))
    .filter(id => id !== creature._id);
  if (!targetIds.length) return [];
  return Creatures.find(
    { _id: { $in: targetIds }, type: { $in: [...GM_CREATURE_TYPES] } }, { fields: { _id: 1 } },
  ).mapAsync(target => target._id);
}

// One lookup at a time per character: its entries keep their order
const intake = new Map<string, Promise<void>>();

async function queueLog(creatureId: string, log: LogEntry, target: WebhookSender) {
  const creature = await Creatures.findOneAsync(creatureId, {
    fields: {
      name: 1, color: 1, picture: 1, avatarPicture: 1, owner: 1, type: 1, 'settings.discordWebhook': 1,
    },
  }) as LogCreature | undefined;
  if (!creature) return;
  const channels = (await logChannels(creature)).filter(channel => !target.isGone(channel.webhook));
  if (!channels.length) return;
  const hiddenIds = await hiddenTargets(creature, log);
  const sheetUrl = Meteor.absoluteUrl(`character/${creature._id}`);
  for (const channel of channels) {
    const input = { log, creature, language: channel.language, sheetUrl, hiddenIds };
    const embeds = discordMessages(input);
    if (!embeds.length) continue;
    const card = logComponents(input);
    target.enqueue(channel.webhook, async request => {
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
 * written.
 */
export function sendLogToDiscord(log: LogEntry) {
  const target = webhookSender();
  const creatureId = log?.creatureId;
  if (!target || !creatureId) return;
  const next = (intake.get(creatureId) ?? Promise.resolve())
    .then(() => queueLog(creatureId, log, target))
    .catch(e => console.error(e));
  intake.set(creatureId, next);
  next.finally(() => {
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
