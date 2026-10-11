import { Meteor } from 'meteor/meteor';
import VERSION from '/imports/constants/VERSION';
import { discordApiBase, discordUserAgent } from '/imports/api/creature/log/server/webhookSender';
import type { Webhook } from '/imports/api/creature/log/discord/webhookUrl';

/*
 * DiceCloud's Discord application, through OAuth2 (phase B): the
 * authorization page, the code's exchange, who the user is (/users/@me), and
 * the webhooks its authorizations create. Its id and
 * secret are the server's settings, `discord.clientId` and
 * `discord.clientSecret`, never public: without them, nothing here is
 * offered, and the rest of DiceCloud goes on as before.
 *
 * The requests go where the webhooks' go (discordApiBase): Discord, or in
 * development and tests the local fake that DISCORD_WEBHOOK_TEST_API names,
 * which fakes the authorization page too. Under tests without it, nowhere.
 */

export type OAuthConfig = {
  clientId: string,
  clientSecret: string,
  // The API, https://discord.com/api/v10, or the local fake's
  apiBase: string,
  // Where Discord sends the browser back: this server's callback
  redirectUri: string,
};

let testConfig: OAuthConfig | undefined | null = null;

/** The application's settings, when this server has them; undefined otherwise */
export function oauthConfig(): OAuthConfig | undefined {
  if (testConfig !== null) return testConfig;
  const { clientId, clientSecret } = (Meteor.settings as { discord?: { clientId?: string, clientSecret?: string } }).discord ?? {};
  const apiBase = discordApiBase();
  if (!clientId || !clientSecret || !apiBase) return undefined;
  return { clientId, clientSecret, apiBase, redirectUri: Meteor.absoluteUrl('discord/oauth/callback') };
}

/** Replaces the settings, for a test; returns the ones it replaced. Refused outside tests */
export function setOAuthConfig(config: OAuthConfig | undefined | null) {
  if (!Meteor.isTest && !Meteor.isAppTest) throw new Meteor.Error('test-only', 'Only tests replace the Discord settings');
  const previous = testConfig;
  testConfig = config;
  return previous;
}

// The browser learns whether to offer the buttons, nothing more
(Meteor.settings.public as Record<string, unknown>).discordOAuth = !!oauthConfig();

export type Scope = 'webhook.incoming' | 'identify';

/**
 * The page where the user authorizes the application, on Discord's site (or
 * the fake's). `silent` asks for `prompt=none`, for "Sign in with Discord":
 * Discord skips its page for a user who authorized `identify` before (their
 * link, whose authorization DiceCloud leaves in place), and the callback
 * starts again with the page on any other answer than a refusal. Otherwise
 * Discord's default, as the probes of 2026-10-10 checked it: the channel
 * picked every time
 */
export function authorizeUrl(config: OAuthConfig, scope: Scope, state: string, { silent = false } = {}): string {
  const url = new URL('/oauth2/authorize', new URL(config.apiBase).origin);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    scope,
    state,
    redirect_uri: config.redirectUri,
    ...silent && { prompt: 'none' },
  }).toString();
  return url.href;
}

const headers = () => ({ 'User-Agent': discordUserAgent(Meteor.absoluteUrl(), VERSION) });
const basicAuth = (config: OAuthConfig) => `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;

export class DiscordOAuthError extends Error {
  status?: number;
  code?: number;
  constructor(message: string, status?: number, code?: number) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call(url: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(15 * 1000) });
  } catch (e) {
    throw new DiscordOAuthError(`Discord did not answer: ${(e as Error)?.message || e}`);
  }
  const text = await response.text().catch(() => '');
  let body: any;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    // Never the request's secrets: only what Discord answered
    throw new DiscordOAuthError(`Discord answered ${response.status}${body?.code ? ` (${body.code})` : ''}`,
      response.status, typeof body?.code === 'number' ? body.code : undefined);
  }
  return body;
}

export type ExchangedWebhook = Webhook & { channelId: string, guildId: string, applicationId?: string };

/**
 * The code's exchange. The OAuth tokens are never kept, logged nor revoked:
 * the webhook's id and token with `webhook.incoming`; the access token alone
 * for `identify`, to read who the user is, then dropped. Revoking it would
 * remove the user's authorization of DiceCloud, which the one-click "Sign in
 * with Discord" (prompt=none) needs; they remove it themselves in Discord's
 * Authorized Apps
 */
export async function exchangeCode(config: OAuthConfig, code: string): Promise<{
  accessToken?: string, webhook?: ExchangedWebhook,
}> {
  const body = await call(`${config.apiBase}/oauth2/token`, {
    method: 'POST',
    headers: { ...headers(), Authorization: basicAuth(config), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: config.redirectUri }).toString(),
  });
  const webhook = body?.webhook;
  return {
    accessToken: typeof body?.access_token === 'string' ? body.access_token : undefined,
    ...webhook?.id && webhook?.token && webhook?.channel_id && {
      webhook: {
        id: String(webhook.id), token: String(webhook.token), channelId: String(webhook.channel_id),
        guildId: String(webhook.guild_id ?? ''), applicationId: webhook.application_id,
      },
    },
  };
}

export type DiscordUser = { id: string, username: string, globalName?: string };

/** Who the user is on Discord: their id, and the name to show */
export async function currentUser(config: OAuthConfig, accessToken: string): Promise<DiscordUser> {
  const body = await call(`${config.apiBase}/users/@me`, {
    headers: { ...headers(), Authorization: `Bearer ${accessToken}` },
  });
  if (!body?.id) throw new DiscordOAuthError('Discord did not say who the user is');
  return {
    id: String(body.id),
    username: String(body.username ?? ''),
    ...body.global_name && { globalName: String(body.global_name) },
  };
}

/**
 * A token of the application itself (client credentials grant), for one
 * scope; DiceCloud asks for `applications.commands.update` alone, the one
 * besides `identify` that an application owned by a team may ask for
 * (Discord's OAuth2 documentation, "Client Credentials Grant"). Used at once,
 * never kept
 */
export async function clientCredentialsToken(config: OAuthConfig, scope: 'applications.commands.update'): Promise<string> {
  const body = await call(`${config.apiBase}/oauth2/token`, {
    method: 'POST',
    headers: { ...headers(), Authorization: basicAuth(config), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope }).toString(),
  });
  if (typeof body?.access_token !== 'string') throw new DiscordOAuthError('Discord gave no token');
  return body.access_token;
}

/**
 * Replaces the application's global commands with these (Bulk Overwrite
 * Global Application Commands), with a client credentials token: no bot
 * token. Returns how many Discord kept
 */
export async function overwriteGlobalCommands(config: OAuthConfig, commands: unknown[]): Promise<number> {
  const token = await clientCredentialsToken(config, 'applications.commands.update');
  const body = await call(`${config.apiBase}/applications/${config.clientId}/commands`, {
    method: 'PUT',
    headers: { ...headers(), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  return Array.isArray(body) ? body.length : 0;
}

/** Whether Discord still knows the webhook: false for a 404 (10015), true otherwise */
export async function webhookExists(apiBase: string, webhook: Webhook): Promise<boolean> {
  try {
    await call(`${apiBase}/webhooks/${webhook.id}/${webhook.token}`, { headers: headers() });
    return true;
  } catch (e) {
    return (e as DiscordOAuthError).status !== 404;
  }
}

/** Deletes a webhook the application created; one Discord no longer knows is gone already */
export async function deleteWebhook(apiBase: string, webhook: Webhook) {
  try {
    await call(`${apiBase}/webhooks/${webhook.id}/${webhook.token}`, { method: 'DELETE', headers: headers() });
  } catch (e) {
    if ((e as DiscordOAuthError).status !== 404) throw e;
  }
}
