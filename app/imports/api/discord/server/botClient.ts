import { Meteor } from 'meteor/meteor';
import VERSION from '/imports/constants/VERSION';
import { oauthConfig } from '/imports/api/discord/server/oauthClient';
import { discordApiBase, discordUserAgent } from '/imports/api/creature/log/server/webhookSender';
import type { ExchangedWebhook } from '/imports/api/discord/server/oauthClient';

/*
 * DiceCloud's bot (phase D): a member a server's administrator adds, with
 * four permissions only (view the channels, manage webhooks, create public
 * threads, send messages in threads), and its token, `discord.botToken` in
 * the server's settings, never published nor logged. Never connected to the
 * Gateway: plain HTTP requests, which the probes of 2026-10-11 showed enough
 * (tools/discord/probe/bot-rest.mjs). It does two things, and only for a
 * channel someone proved their right to:
 *
 * - creates the public thread of a session in the text channel a party's or
 *   a character's webhook posts in, as Discord says: connected, or pasted
 *   (whoever holds a webhook's URL may post there already) ("New session",
 *   discordSessions.ts);
 * - creates DiceCloud's webhook in a channel or a forum where /connect was run
 *   by someone allowed to manage its webhooks.
 *
 * It never posts a message itself: the webhooks do, under the character's
 * name. The requests go where the webhooks' go: Discord, or in development
 * and tests the local fake.
 */

// https://docs.discord.com/developers/topics/permissions
export const BOT_PERMISSIONS = {
  VIEW_CHANNEL: BigInt(1) << BigInt(10),
  MANAGE_WEBHOOKS: BigInt(1) << BigInt(29),
  CREATE_PUBLIC_THREADS: BigInt(1) << BigInt(35),
  SEND_MESSAGES_IN_THREADS: BigInt(1) << BigInt(38),
};
const ADMINISTRATOR = BigInt(8);

/** The permissions the bot asks for when added to a server: 309774517248 */
export const BOT_PERMISSION_INTEGER = Object.values(BOT_PERMISSIONS).reduce((sum, bit) => sum | bit, BigInt(0));

/** Whether a permission set Discord sent (a decimal string) holds a permission, or administrator */
export function hasPermission(permissions: unknown, bit: bigint): boolean {
  if (typeof permissions !== 'string' || !/^\d{1,30}$/.test(permissions)) return false;
  const value = BigInt(permissions);
  return (value & ADMINISTRATOR) === ADMINISTRATOR || (value & bit) === bit;
}

let testToken: string | undefined | null = null;

/** The bot's token, when this server has one */
export function botToken(): string | undefined {
  if (testToken !== null) return testToken;
  const token = (Meteor.settings as { discord?: { botToken?: unknown } }).discord?.botToken;
  return typeof token === 'string' && token.trim() ? token.trim() : undefined;
}

/** Replaces the token, for a test (undefined: none); returns the one it replaced. Refused outside tests */
export function setBotToken(token: string | undefined | null) {
  if (!Meteor.isTest && !Meteor.isAppTest) throw new Meteor.Error('test-only', 'Only tests replace the bot token');
  const previous = testToken;
  testToken = token;
  return previous;
}

// The browser learns whether to offer the bot's ways, nothing more
(Meteor.settings.public as Record<string, unknown>).discordBot = !!botToken();

export type BotResult<T> = { ok: true, value: T } | { ok: false, status?: number, code?: number };

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<BotResult<T>> {
  const token = botToken();
  const base = oauthConfig()?.apiBase ?? discordApiBase();
  if (!token || !base) return { ok: false };
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${token}`,
        'User-Agent': discordUserAgent(Meteor.absoluteUrl(), VERSION),
        ...body !== undefined && { 'Content-Type': 'application/json' },
      },
      ...body !== undefined && { body: JSON.stringify(body) },
      signal: AbortSignal.timeout(15 * 1000),
    });
  } catch (e) {
    console.warn(`Discord: the bot's request did not leave: ${(e as Error)?.message || e}`);
    return { ok: false };
  }
  const text = await response.text().catch(() => '');
  let data: any;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (!response.ok) {
    // What Discord answered: never the token
    return { ok: false, status: response.status, ...typeof data?.code === 'number' && { code: data.code } };
  }
  return { ok: true, value: data as T };
}

const snowflake = (id: unknown): id is string => typeof id === 'string' && /^\d{1,32}$/.test(id);

/** A channel as the bot sees it: its type (0 text, 15 forum, 11 a public thread...), its parent, its server */
export async function botChannel(channelId: string): Promise<BotResult<{ id: string, type: number, parentId?: string, guildId?: string }>> {
  if (!snowflake(channelId)) return { ok: false };
  const result = await call<any>('GET', `/channels/${channelId}`);
  if (!result.ok) return result;
  return {
    ok: true,
    value: {
      id: String(result.value?.id), type: Number(result.value?.type),
      ...snowflake(result.value?.parent_id) && { parentId: result.value.parent_id },
      ...snowflake(result.value?.guild_id) && { guildId: result.value.guild_id },
    },
  };
}

/** A public thread of a text channel, without a message, archived after a week without one */
export async function createPublicThread(channelId: string, name: string): Promise<BotResult<{ threadId: string }>> {
  if (!snowflake(channelId)) return { ok: false };
  const result = await call<any>('POST', `/channels/${channelId}/threads`, {
    name: name.slice(0, 100) || 'DiceCloud', type: 11, auto_archive_duration: 10080,
  });
  if (!result.ok) return result;
  return snowflake(result.value?.id) ? { ok: true, value: { threadId: result.value.id } } : { ok: false };
}

/** DiceCloud's webhook in a text channel or a forum, which the application owns */
export async function createChannelWebhook(channelId: string): Promise<BotResult<ExchangedWebhook>> {
  if (!snowflake(channelId)) return { ok: false };
  const result = await call<any>('POST', `/channels/${channelId}/webhooks`, { name: 'DiceCloud' });
  if (!result.ok) return result;
  const hook = result.value;
  if (!snowflake(hook?.id) || typeof hook?.token !== 'string') return { ok: false };
  return {
    ok: true,
    value: {
      id: hook.id, token: hook.token, channelId: String(hook.channel_id ?? channelId), guildId: String(hook.guild_id ?? ''),
      ...hook.application_id && { applicationId: String(hook.application_id) },
    },
  };
}
