import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { Accounts } from 'meteor/accounts-base';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import { getPartyRole } from '/imports/api/creature/creatureFolders/party';
import {
  DiscordOAuthError, authorizeUrl, currentUser, exchangeCode, oauthConfig, type OAuthConfig,
} from '/imports/api/discord/server/oauthClient';
import { createState, createTicket, nonceMatches, takeState, takeTicket } from '/imports/api/discord/server/oauthStates';
import { connectTarget } from '/imports/api/creature/log/server/connectedWebhooks';
import { NONCE_COOKIE_PATH, nonceCookieName } from '/imports/api/discord/discordNonce';

/*
 * Where Discord sends the browser back after an authorization (phase B):
 * <ROOT_URL>/discord/oauth/callback, with a code and the state DiceCloud gave
 * it. The browser carries no Meteor login here: the state, taken once, says
 * who asked and for what, and the rights are checked again; the browser must
 * be the one that started it (discordNonce.js). Then back to the page the
 * user came from, with `?discord=<result>`, which the page shows in the
 * user's language (discordResult.js).
 *
 * The OAuth tokens are dropped at once, neither stored, logged nor revoked:
 * - connect (D4): the code's exchange gives a webhook, which DiceCloud keeps
 *   (the webhook does not need the tokens: checked 2026-10-10);
 * - link (D5): /users/@me says who the user is on Discord; DiceCloud keeps
 *   their id and name. Their authorization of DiceCloud stays, which they
 *   can remove in Discord's Authorized Apps;
 * - login: the same, for an account already linked, with prompt=none: one
 *   click for a user who linked their account; any answer but a refusal
 *   starts again, once, with Discord's page. Then a one-time ticket, bound to
 *   the browser's nonce, that the sign-in page logs in with. Never an account
 *   created.
 */

export type CallbackResult =
  | 'connected' | 'linked' | 'denied' | 'expired' | 'forbidden' | 'error' | 'full' | 'taken' | 'unknown'
  // Signed in on Discord: the sign-in page logs in with the ticket
  | 'ticket';

// The page to go back to, with the result
function back(path: string, result: CallbackResult, extra: Record<string, string> = {}): string {
  const url = new URL(path, 'http://dicecloud.local');
  url.searchParams.set('discord', result);
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}

// The sign-in page, with the result and the page to go to once signed in
const backToSignIn = (result: CallbackResult, returnTo: string, extra: Record<string, string> = {}) =>
  back('/sign-in', result, { ...extra, ...returnTo !== '/' && { redirect: returnTo } });

/** Who may connect the target: its editors for a character, the game master for a board */
async function mayConnect(userId: string | undefined, target: { creatureId: string } | { folderId: string }) {
  if (!userId) return false;
  const user = await Meteor.users.findOneAsync(userId, { fields: { roles: 1 } });
  if (!user) return false;
  if ('creatureId' in target) {
    const creature = await Creatures.findOneAsync(target.creatureId, {
      fields: { owner: 1, writers: 1, readers: 1, public: 1 },
    });
    return !!creature && hasEditPermission(creature, user);
  }
  const { default: CreatureFolders } = await import('/imports/api/creature/creatureFolders/CreatureFolders');
  const folder = await CreatureFolders.findOneAsync(target.folderId, { fields: { owner: 1, members: 1 } });
  return getPartyRole(folder, userId) === 'gm';
}

// Who the user is on Discord; the token dropped
async function identify(config: OAuthConfig, code: string) {
  const { accessToken } = await exchangeCode(config, code);
  if (!accessToken) throw new DiscordOAuthError('Discord gave no token');
  return currentUser(config, accessToken);
}

/** The cookies of a request, by name */
export function parseCookies(header: unknown): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (typeof header !== 'string') return cookies;
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at > 0) cookies[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return cookies;
}

/**
 * What the redirect from Discord does: where the browser goes next, a page of
 * the app or Discord's page again; and the nonce's cookie to clear
 */
export async function handleCallback(
  query: Record<string, string | undefined>, cookies: Record<string, string> = {},
): Promise<{ location: string, clearCookie?: string }> {
  const pending = await takeState(query.state);
  if (!pending) return { location: back('/', 'expired') };
  const returnTo = pending.returnTo || '/';
  const login = pending.purpose === 'login';
  const done = (location: string) => ({ location, ...!login && { clearCookie: nonceCookieName(pending.nonceHash) } });
  const result = (outcome: CallbackResult) => done(login ? backToSignIn(outcome, returnTo) : back(returnTo, outcome));
  // Connect and link act here: only for the browser that started them (its
  // cookie). Sign in acts on the sign-in page, which wants the nonce itself
  if (!login && !nonceMatches(cookies[nonceCookieName(pending.nonceHash)], pending.nonceHash)) return result('expired');
  const config = oauthConfig();
  if (query.error) {
    // prompt=none, and an answer other than the user's refusal (an
    // authorization Discord wants to ask for): once more, with its page
    if (login && pending.silent && query.error !== 'access_denied' && config) {
      const state = await createState({ purpose: 'login', returnTo, nonceHash: pending.nonceHash });
      return done(authorizeUrl(config, 'identify', state));
    }
    return result(query.error === 'access_denied' ? 'denied' : 'error');
  }
  if (!config || !query.code) return result('error');
  try {
    if (pending.purpose === 'connect' && pending.target) {
      if (!await mayConnect(pending.userId, pending.target)) return result('forbidden');
      const { webhook } = await exchangeCode(config, query.code);
      if (!webhook) return result('error');
      await connectTarget({ apiBase: config.apiBase, target: pending.target, userId: pending.userId as string, webhook });
      return result('connected');
    }
    if (pending.purpose === 'link' && pending.userId) {
      const discordUser = await identify(config, query.code);
      const other = await Meteor.users.findOneAsync(
        { 'discordAccount.id': discordUser.id, _id: { $ne: pending.userId } }, { fields: { _id: 1 } });
      // One DiceCloud account per Discord account
      if (other) return result('taken');
      await Meteor.users.updateAsync(pending.userId, {
        $set: {
          discordAccount: {
            id: discordUser.id,
            ...discordUser.globalName || discordUser.username ? { username: discordUser.globalName || discordUser.username } : {},
            linkedAt: new Date(),
          },
        },
      });
      return result('linked');
    }
    if (login) {
      const discordUser = await identify(config, query.code);
      const user = await Meteor.users.findOneAsync({ 'discordAccount.id': discordUser.id }, { fields: { _id: 1 } });
      // Never an account created: a Discord account not linked is told how to link it
      if (!user) return result('unknown');
      const ticket = await createTicket(user._id, pending.nonceHash, returnTo);
      return done(backToSignIn('ticket', returnTo, { ticket }));
    }
  } catch (e) {
    const error = e as DiscordOAuthError;
    // Discord allows 15 webhooks per channel
    if (error.code === 30007) return result('full');
    console.warn(`Discord authorization failed: ${error.message}`);
    return result('error');
  }
  return result('error');
}

WebApp.handlers.use('/discord/oauth/callback', async (req: any, res: any) => {
  if (req.method !== 'GET') {
    res.writeHead(405, { Allow: 'GET' });
    res.end();
    return;
  }
  const query = Object.fromEntries(new URL(req.url, 'http://dicecloud.local').searchParams);
  let next: { location: string, clearCookie?: string };
  try {
    next = await handleCallback(query, parseCookies(req.headers.cookie));
  } catch (e) {
    console.error(e);
    next = { location: back('/', 'error') };
  }
  // A page of the app, or Discord's page again (prompt=none's second try)
  const location = next.location.startsWith('/') ? Meteor.absoluteUrl(next.location.slice(1)) : next.location;
  // Nothing of the code nor the state in the next page's referrer
  res.writeHead(302, {
    Location: location, 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
    // The nonce's cookie, used: gone
    ...next.clearCookie && {
      'Set-Cookie': `${next.clearCookie}=; Path=${NONCE_COOKIE_PATH}; Max-Age=0; SameSite=Lax`
        + `${Meteor.absoluteUrl().startsWith('https:') ? '; Secure' : ''}`,
    },
  });
  res.end();
});

// "Sign in with Discord": the one-time ticket the callback gave, with the
// nonce of the browser that started it, through the accounts' own login
// method (its rate limit and hooks apply). A ticket only ever names an account
// that linked its Discord account itself; taken once, even with a wrong nonce
Accounts.registerLoginHandler('discord', async (options: { discordTicket?: unknown, discordNonce?: unknown }) => {
  if (options?.discordTicket === undefined) return undefined;
  const ticket = await takeTicket(options.discordTicket);
  if (!ticket?.userId || !nonceMatches(options.discordNonce, ticket.nonceHash)) {
    return { error: new Meteor.Error('discord-sign-in-expired', 'This Discord sign-in has expired: try again') };
  }
  return { userId: ticket.userId };
});
