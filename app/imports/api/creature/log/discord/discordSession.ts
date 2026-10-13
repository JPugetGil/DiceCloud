import { TypedSimpleSchema } from '/imports/api/utility/TypedSimpleSchema';
import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';

/*
 * A play session on Discord (D3): the "New session" button of a party board
 * or of a character opens one, and then everything its webhook posts goes
 * there: in a forum channel, a post of its own; in a text channel, a public
 * thread DiceCloud's bot creates (no other way since 2026-10-12). "Resume a
 * session" opens one of the last ones again (`PastSession`). "End session"
 * goes back to the channel; so does a thread that no longer takes messages,
 * which leaves a notice (`SESSION_CLOSED_FIELDS`). Kept with the webhook, and like it
 * only for those who may change it: the editors of the character, the game
 * master of the party.
 *
 * Sessions opened before 2026-10-12 may be of two kinds no longer offered: a
 * header message in a text channel (`channel`), a thread the game master made
 * and pasted the link of (`thread`). They go on until "End session".
 */

export type SessionKind = 'forum' | 'channel' | 'thread';

// The fields of a session, `true as const`: optional in the type it infers
export const DISCORD_SESSION_FIELDS = {
  // The webhook it was opened on: a session of another webhook is over
  webhookId: {
    type: String,
    max: 32,
  },
  kind: {
    type: String,
    allowedValues: ['forum', 'channel', 'thread'],
  },
  // The forum post or the thread: its id, and the message that opened it
  threadId: {
    type: String,
    optional: true as const,
    max: 32,
  },
  messageId: {
    type: String,
    optional: true as const,
    max: 32,
  },
  // "Session of October 10, 2026 — The Heroes"
  name: {
    type: String,
    optional: true as const,
    max: STORAGE_LIMITS.name,
  },
  startedAt: {
    type: Date,
  },
};

export const DiscordSessionSchema = TypedSimpleSchema.from(DISCORD_SESSION_FIELDS);

type Prefixed<P extends string, D> = { [K in keyof D as K extends string ? `${P}.${K}` : never]: D[K] };

/**
 * The session's fields under a field of a schema, `discordSession.webhookId`
 * and so on: the subschema itself, as a field's type, is not typed here
 */
export function sessionFields<P extends string>(prefix: P): Prefixed<P, typeof DISCORD_SESSION_FIELDS> {
  return Object.fromEntries(Object.entries(DISCORD_SESSION_FIELDS)
    .map(([key, definition]) => [`${prefix}.${key}`, definition])) as Prefixed<P, typeof DISCORD_SESSION_FIELDS>;
}

export type DiscordSession = {
  webhookId: string,
  kind: SessionKind,
  threadId?: string,
  messageId?: string,
  name?: string,
  startedAt: Date,
};

/** A session that ended by itself, its thread no longer taking messages: shown until the next one */
export const SESSION_CLOSED_FIELDS = {
  name: { type: String, optional: true as const, max: STORAGE_LIMITS.name },
  at: { type: Date },
};

/** The session, if it is one of this webhook's */
export function sessionOf(
  session: DiscordSession | undefined | null, webhookId: string | undefined,
): DiscordSession | undefined {
  return session && webhookId && session.webhookId === webhookId ? session : undefined;
}

// ---------------------------------------------------------------- the last sessions

/** How many sessions a party or a character keeps, to resume one */
export const SESSION_HISTORY_LENGTH = 10;

/**
 * A session DiceCloud opened, which "Resume a session" offers again: its
 * thread (the bot's in a text channel, or a forum post), its name, the channel
 * it is in and the webhook it was opened with, and when
 */
export type PastSession = {
  threadId: string,
  kind: 'thread' | 'forum',
  name?: string,
  channelId?: string,
  webhookId: string,
  startedAt: Date,
};

export const PAST_SESSION_FIELDS = {
  threadId: { type: String, max: 32 },
  kind: { type: String, allowedValues: ['thread', 'forum'] },
  name: { type: String, optional: true as const, max: STORAGE_LIMITS.name },
  channelId: { type: String, optional: true as const, max: 32 },
  webhookId: { type: String, max: 32 },
  startedAt: { type: Date },
};

type ArrayFields<P extends string> = Prefixed<`${P}.$`, typeof PAST_SESSION_FIELDS> & {
  [K in P]: { type: ArrayConstructor, optional: true, maxCount: number }
} & { [K in `${P}.$`]: { type: ObjectConstructor } };

/** The fields of the last sessions under a field of a schema: the array, its items and their fields */
export function pastSessionFields<P extends string>(prefix: P): ArrayFields<P> {
  return {
    [prefix]: { type: Array, optional: true, maxCount: SESSION_HISTORY_LENGTH },
    [`${prefix}.$`]: { type: Object },
    ...Object.fromEntries(Object.entries(PAST_SESSION_FIELDS).map(([key, definition]) => [`${prefix}.$.${key}`, definition])),
  } as ArrayFields<P>;
}

/** The last sessions with one more, first: once each, the oldest dropped */
export function withPastSession(history: PastSession[] | undefined | null, past: PastSession): PastSession[] {
  return [past, ...(history || []).filter(other => other.threadId !== past.threadId)].slice(0, SESSION_HISTORY_LENGTH);
}

/**
 * Whether a past session is of the channel a webhook posts in now: the same
 * channel when both are known, else the same webhook
 */
export function isPastSessionHere(past: PastSession, here: { channelId?: string | null, webhookId?: string | null }): boolean {
  if (past.channelId && here.channelId) return past.channelId === here.channelId;
  return !!here.webhookId && past.webhookId === here.webhookId;
}

/** The sessions "Resume a session" offers: of the channel connected now, but the one open */
export function resumableSessions(history: PastSession[] | undefined | null, here: {
  channelId?: string | null, webhookId?: string | null, openThreadId?: string | null,
}): PastSession[] {
  return (history || []).filter(past => isPastSessionHere(past, here) && past.threadId !== here.openThreadId);
}
