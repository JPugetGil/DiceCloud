import { Random } from 'meteor/random';
import { Accounts } from 'meteor/accounts-base';
import {
  NONCE_COOKIE_PATH, NONCE_COOKIE_SECONDS, nonceCookieName,
} from '/imports/api/discord/discordNonce';

/*
 * The browser's side of api/discord/discordNonce.js: a nonce for each
 * authorization with Discord, its hash for the server; for "Sign in with
 * Discord" the nonce waits in localStorage, for the others in a cookie that
 * only the callback receives.
 */

const SIGN_IN_KEY = 'discordSignInNonce';

// SHA-256 in hexadecimal: the browser's own, which only secure pages have
// (https, localhost); else the one accounts-password hashes passwords with
async function sha256(text) {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return Accounts._hashPassword(text).digest;
}

/**
 * Draws a nonce for an authorization ('connect', 'link' or 'login') and
 * keeps it in this browser; returns its hash, which alone goes to the server
 */
export async function bindToThisBrowser(purpose) {
  const nonce = Random.secret(43);
  const nonceHash = await sha256(nonce);
  if (purpose === 'login') {
    try {
      localStorage.setItem(SIGN_IN_KEY, nonce);
    } catch (e) {
      // Storage refused (a private window may): the sign-in will say it expired
      console.warn('No room for the Discord sign-in\'s nonce', e);
    }
  } else {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${nonceCookieName(nonceHash)}=${nonce}; Path=${NONCE_COOKIE_PATH}; `
      + `Max-Age=${NONCE_COOKIE_SECONDS}; SameSite=Lax${secure}`;
  }
  return nonceHash;
}

/** The nonce of the sign-in this browser started, if any */
export function signInNonce() {
  try {
    return localStorage.getItem(SIGN_IN_KEY) || undefined;
  } catch {
    return undefined;
  }
}

/** Forgets it, once used */
export function clearSignInNonce() {
  try {
    localStorage.removeItem(SIGN_IN_KEY);
  } catch {
    // Nothing kept
  }
}
