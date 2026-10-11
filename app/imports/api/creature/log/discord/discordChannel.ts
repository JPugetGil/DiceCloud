import { sessionOf, type DiscordSession } from '/imports/api/creature/log/discord/discordSession';

/*
 * A Discord channel a character or a party board is connected to with
 * "Connect to Discord" (D4): the webhook DiceCloud's application created
 * there, by its id, and where it posts. Its token is a secret the server
 * alone keeps (server/connectedWebhooks.ts): no client ever gets it, not even
 * the character's owner. Like a pasted webhook, only those who may change it
 * get this: the character's editors, the party's game master. Shared by the
 * client and the server.
 */

export type DiscordChannel = {
  webhookId: string,
  guildId: string,
  channelId: string,
  connectedAt: Date,
};

// The fields of a connected channel, `true as const`: optional in the type it infers
export const DISCORD_CHANNEL_FIELDS = {
  webhookId: {
    type: String,
    max: 32,
  },
  guildId: {
    type: String,
    max: 32,
  },
  channelId: {
    type: String,
    max: 32,
  },
  connectedAt: {
    type: Date,
  },
};

type Prefixed<P extends string, D> = { [K in keyof D as K extends string ? `${P}.${K}` : never]: D[K] };

/** The channel's fields under a field of a schema, `discordChannel.webhookId` and so on */
export function channelFields<P extends string>(prefix: P): Prefixed<P, typeof DISCORD_CHANNEL_FIELDS> {
  return Object.fromEntries(Object.entries(DISCORD_CHANNEL_FIELDS)
    .map(([key, definition]) => [`${prefix}.${key}`, definition])) as Prefixed<P, typeof DISCORD_CHANNEL_FIELDS>;
}

/**
 * The server and the thread a link of Discord's app names, as "Copy Link"
 * gives it: https://discord.com/channels/<server>/<thread> (or a message's,
 * /<message> after it; ptb. and canary. too). Undefined for anything else
 */
export function parseThreadLink(link?: string | null): { guildId: string, threadId: string } | undefined {
  const match = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(\d{1,32})\/(\d{1,32})(?:\/\d{1,32})?\/?$/
    .exec(String(link || '').trim());
  return match ? { guildId: match[1], threadId: match[2] } : undefined;
}

/** The channel in Discord's app: https://discord.com/channels/<server>/<channel> */
export function discordChannelUrl(channel?: { guildId?: string, channelId?: string } | null): string | undefined {
  if (!channel?.guildId || !channel.channelId) return undefined;
  return `https://discord.com/channels/${channel.guildId}/${channel.channelId}`;
}

/**
 * The id of the webhook a character or a party posts with: the connected
 * channel's, else the pasted one's (its id, kept beside the sealed URL)
 */
export function webhookIdOf(channel?: DiscordChannel | null, pastedId?: string | null): string | undefined {
  return channel?.webhookId || pastedId || undefined;
}

/** The session, if it is one of the webhook it posts with now */
export function currentSession(
  session: DiscordSession | undefined | null, channel?: DiscordChannel | null, pastedId?: string | null,
) {
  return sessionOf(session, webhookIdOf(channel, pastedId));
}
