/*
 * Each authorization with Discord is bound to the browser that started it
 * (RFC 6749 §10.12): before asking the server for Discord's address, the
 * browser draws a secret, the nonce, and sends only its SHA-256 hash, which
 * the state keeps. Back from Discord, the nonce must come from that browser:
 *
 * - "Sign in with Discord": the nonce waits in the browser's localStorage;
 *   the ticket the callback gives inherits the state's hash, and the login
 *   handler wants the ticket and the nonce whose hash it is. A ticket, or a
 *   callback's address, sent to someone else signs nobody in;
 * - "Connect to Discord" and "Link my Discord account": the callback does the
 *   work, so the nonce waits in a cookie that only the callback receives
 *   (its path, SameSite=Lax, 10 minutes, one per authorization), and the
 *   callback wants it. Someone else's authorization page, sent to a user,
 *   connects or links nothing of theirs.
 *
 * Shared by the client and the server.
 */

/** The hash of a nonce, as the methods take it: SHA-256 in hexadecimal */
export const NONCE_HASH = /^[0-9a-f]{64}$/;

/** Where the cookie goes: only to the callback */
export const NONCE_COOKIE_PATH = '/discord/oauth/callback';

/** How long the cookie lasts, as the state (oauthStates.ts) */
export const NONCE_COOKIE_SECONDS = 10 * 60;

/** The cookie of an authorization, by its nonce's hash: one per authorization */
export function nonceCookieName(nonceHash) {
  return `discordNonce-${String(nonceHash).slice(0, 16)}`;
}
