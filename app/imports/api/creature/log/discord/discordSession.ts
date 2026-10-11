import { TypedSimpleSchema } from '/imports/api/utility/TypedSimpleSchema';
import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';

/*
 * A play session on Discord (D3): the "New session" button of a party board
 * or of a character opens one, and then everything its webhook posts goes
 * there. In a forum channel it is a post of its own, a thread; in a text
 * channel, where a webhook cannot open a thread, a header message marks where
 * it starts and the messages follow in the channel, or, in a thread the game
 * master made in that channel and pasted the link of, everything goes into
 * that thread. "End session" goes back to the channel; so does a thread that
 * no longer takes messages, which leaves a notice (`SessionClosed`). Kept with
 * the webhook, and like it only for those who may change it: the editors of
 * the character, the game master of the party.
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
export type SessionClosed = { name?: string, at: Date };

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
