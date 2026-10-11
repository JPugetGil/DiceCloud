import { Mongo } from 'meteor/mongo';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';

// node:crypto, on the server alone, as in secretCipher.ts
const { createHash, timingSafeEqual }: typeof import('node:crypto') = Meteor.isServer
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? require('node:crypto') : {} as typeof import('node:crypto');

/*
 * The OAuth2 `state` of each authorization DiceCloud starts with Discord, and
 * the one-time tickets of "Sign in with Discord". The browser that comes back
 * from Discord carries no Meteor login: the state is what says who asked and
 * for what. Each is a secret, used once (taken out atomically), and expires
 * after 10 minutes, a ticket after 2. Each keeps the hash of the nonce of the
 * browser that started it (discordNonce.js), which a ticket inherits. Server
 * only: no client ever gets this collection.
 */

export type OAuthPurpose = 'connect' | 'link' | 'login';

// What an authorization is for: a webhook for a character or a party board,
// linking the user's Discord account, or signing in with it
export type OAuthTarget = { creatureId: string } | { folderId: string };

type StateDoc = {
  _id: string,
  kind: 'state' | 'ticket',
  purpose?: OAuthPurpose,
  userId?: string,
  target?: OAuthTarget,
  // The page to go back to, a path of the app
  returnTo: string,
  // The SHA-256 of the nonce of the browser that started it (discordNonce.js)
  nonceHash: string,
  // Asked with prompt=none: an error other than a refusal starts again with Discord's page
  silent?: boolean,
  createdAt: Date,
};

export const STATE_LIFETIME_MS = 10 * 60 * 1000;
export const TICKET_LIFETIME_MS = 2 * 60 * 1000;

export const DiscordOAuthStates = new Mongo.Collection<StateDoc>('discordOAuthStates');

Meteor.startup(async () => {
  // MongoDB removes them once expired; taking one checks its age too
  await DiscordOAuthStates.rawCollection().createIndex({ createdAt: 1 }, { expireAfterSeconds: STATE_LIFETIME_MS / 1000 });
});

/** A path of the app to come back to: anything else is the home page */
export function safeReturnTo(path?: string): string {
  return typeof path === 'string' && /^\/(?![/\\])[^\s]*$/.test(path) ? path : '/';
}

/** A new state for an authorization: a secret, which the redirect brings back */
export async function createState({ purpose, userId, target, returnTo, nonceHash, silent }: {
  purpose: OAuthPurpose, userId?: string, target?: OAuthTarget, returnTo?: string, nonceHash: string, silent?: boolean,
}): Promise<string> {
  const _id = Random.secret(32);
  await DiscordOAuthStates.insertAsync({
    _id, kind: 'state', purpose, ...userId && { userId }, ...target && { target },
    returnTo: safeReturnTo(returnTo), nonceHash, ...silent && { silent }, createdAt: new Date(),
  });
  return _id;
}

async function take(_id: unknown, kind: StateDoc['kind'], lifetimeMs: number): Promise<StateDoc | undefined> {
  if (typeof _id !== 'string' || !_id) return undefined;
  // Taken out at once: a second use finds nothing
  const doc = await DiscordOAuthStates.rawCollection().findOneAndDelete({ _id, kind });
  // The driver returns the document, or { value } in its older form
  const found = (doc && 'value' in doc ? doc.value : doc) as StateDoc | null;
  if (!found || Date.now() - new Date(found.createdAt).getTime() > lifetimeMs) return undefined;
  return found;
}

/** The authorization a state stands for, once; undefined when unknown, used or expired */
export function takeState(state: unknown) {
  return take(state, 'state', STATE_LIFETIME_MS);
}

/** A one-time ticket that signs its user in, for "Sign in with Discord", in the browser of the nonce */
export async function createTicket(userId: string, nonceHash: string, returnTo?: string): Promise<string> {
  const _id = Random.secret(32);
  await DiscordOAuthStates.insertAsync({
    _id, kind: 'ticket', userId, nonceHash, returnTo: safeReturnTo(returnTo), createdAt: new Date(),
  });
  return _id;
}

/** Whether a nonce is the one whose hash a state or ticket keeps */
export function nonceMatches(nonce: unknown, nonceHash: string | undefined): boolean {
  if (typeof nonce !== 'string' || !nonce || nonce.length > 256) return false;
  if (typeof nonceHash !== 'string' || !/^[0-9a-f]{64}$/.test(nonceHash)) return false;
  const hash = createHash('sha256').update(nonce).digest();
  return timingSafeEqual(hash, Buffer.from(nonceHash, 'hex'));
}

/** The user a ticket signs in, once; undefined when unknown, used or expired */
export function takeTicket(ticket: unknown) {
  return take(ticket, 'ticket', TICKET_LIFETIME_MS);
}
