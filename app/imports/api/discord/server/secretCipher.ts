import { Meteor } from 'meteor/meteor';

// node:crypto, on the server alone: the client's bundle of the tests reaches
// this module through the server modules they import, and has no node:crypto
const { createCipheriv, createDecipheriv, createHash, randomBytes }: typeof import('node:crypto') = Meteor.isServer
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? require('node:crypto') : {} as typeof import('node:crypto');

/*
 * The Discord webhooks' tokens at rest: those "Connect to Discord" keeps
 * (discordWebhooks) and the URLs pasted on characters and party boards. They
 * are sealed with AES-256-GCM, with a key from the server's settings,
 * `discord.tokenKey` (32 random bytes in base64: `openssl rand -base64 32`),
 * which is never stored in MongoDB: a dump of the database, a backup sent to
 * S3, holds no webhook anyone could post with.
 *
 * A sealed value reads `enc1.<key id>.<iv>.<ciphertext>.<tag>` (base64url):
 * `enc1` names the format, the key id is the first 8 hex digits of the key's
 * SHA-256. So plaintext and sealed values live side by side (a token or a URL
 * never starts with `enc1.`), and a new key can replace the old one: the old
 * one goes to `discord.oldTokenKeys`, which still opens what it sealed, and
 * the startup job (pastedWebhooks.ts) seals it all again with the new one.
 *
 * Without a key, values are stored in plaintext, as before, and the startup
 * job says so once. Server only.
 */

const FORMAT = 'enc1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const SEALED = /^enc1\.([0-9a-f]{8})\.([\w-]+)\.([\w-]*)\.([\w-]+)$/;

type Key = { id: string, bytes: Buffer };
type Keys = { current?: Key, all: Map<string, Key>, problems: string[] };

/** A sealed value that cannot be opened: tampered with, malformed, or sealed with a key this server lacks */
export class SecretError extends Error {}

function parseKey(value: unknown, name: string): Key {
  const bytes = typeof value === 'string' ? Buffer.from(value.trim(), 'base64') : Buffer.alloc(0);
  if (bytes.length !== 32) throw new SecretError(`${name} is not 32 bytes in base64 (openssl rand -base64 32)`);
  return { id: createHash('sha256').update(bytes).digest('hex').slice(0, 8), bytes };
}

function readKeys(tokenKey: unknown, oldTokenKeys: unknown): Keys {
  const keys: Keys = { all: new Map(), problems: [] };
  const add = (value: unknown, name: string) => {
    try {
      const key = parseKey(value, name);
      keys.all.set(key.id, key);
      return key;
    } catch (e) {
      keys.problems.push((e as Error).message);
      return undefined;
    }
  };
  if (tokenKey) keys.current = add(tokenKey, 'discord.tokenKey');
  const old = Array.isArray(oldTokenKeys) ? oldTokenKeys : oldTokenKeys ? [oldTokenKeys] : [];
  old.forEach((value, i) => add(value, `discord.oldTokenKeys[${i}]`));
  return keys;
}

let settingsKeys: Keys | undefined;
let testKeys: Keys | null = null;

function keys(): Keys {
  if (testKeys) return testKeys;
  if (!settingsKeys) {
    const { tokenKey, oldTokenKeys } = (Meteor.settings as { discord?: { tokenKey?: unknown, oldTokenKeys?: unknown } }).discord ?? {};
    settingsKeys = readKeys(tokenKey, oldTokenKeys);
  }
  return settingsKeys;
}

/** Replaces the keys, for a test (none: no key); returns a function that puts the settings' back. Refused outside tests */
export function setTokenKeys(tokenKey?: string, oldTokenKeys: string[] = []): () => void {
  if (!Meteor.isTest && !Meteor.isAppTest) throw new Meteor.Error('test-only', 'Only tests replace the token keys');
  const previous = testKeys;
  testKeys = readKeys(tokenKey, oldTokenKeys);
  return () => {
    testKeys = previous;
  };
}

/** Whether this server seals the tokens; and what is wrong with the keys of its settings, if anything */
export function tokenKeyStatus(): { sealing: boolean, keyId?: string, problems: string[] } {
  const { current, problems } = keys();
  return { sealing: !!current, keyId: current?.id, problems };
}

/** Whether a stored value is sealed (with any key) */
export function isSealed(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(`${FORMAT}.`);
}

/** The values the startup job leaves as they are: sealed with the current key. A RegExp for MongoDB too */
export function sealedWithCurrentKey(): RegExp | undefined {
  const key = keys().current;
  return key && new RegExp(`^${FORMAT}\\.${key.id}\\.`);
}

/** A secret as it is to be stored: sealed with the current key, as it is without one */
export function sealSecret(plain: string): string {
  const key = keys().current;
  if (!key) return plain;
  const header = `${FORMAT}.${key.id}`;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key.bytes, iv, { authTagLength: TAG_BYTES });
  // The header too is authenticated
  cipher.setAAD(Buffer.from(header));
  const sealed = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [header, iv.toString('base64url'), sealed.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}

/**
 * A stored secret, readable: a plaintext one as it is, a sealed one opened.
 * Throws a SecretError for a sealed one it cannot open
 */
export function openSecret(stored: string): string {
  if (!isSealed(stored)) return stored;
  const match = SEALED.exec(stored);
  if (!match) throw new SecretError('a sealed value, malformed');
  const [, keyId, iv, sealed, tag] = match;
  const key = keys().all.get(keyId);
  if (!key) throw new SecretError(`sealed with the key ${keyId}, which this server's settings lack`);
  const ivBytes = Buffer.from(iv, 'base64url');
  const tagBytes = Buffer.from(tag, 'base64url');
  // GCM takes shorter tags, which are easier to forge: only these sizes
  if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES) throw new SecretError('a sealed value, malformed');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key.bytes, ivBytes, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(`${FORMAT}.${keyId}`));
    decipher.setAuthTag(tagBytes);
    return Buffer.concat([decipher.update(Buffer.from(sealed, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new SecretError(`a sealed value that the key ${keyId} does not open: altered`);
  }
}

const warned = new Set<string>();

/** openSecret, or undefined with a warning (once per reason) when it cannot be opened */
export function openSecretOrWarn(stored: string | undefined, what: string): string | undefined {
  if (!stored) return undefined;
  try {
    return openSecret(stored);
  } catch (e) {
    const reason = `${what}: ${(e as Error).message}`;
    if (!warned.has(reason)) {
      warned.add(reason);
      console.warn(`Discord: ${reason}. It is not used until the key is back, or it is set again`);
    }
    return undefined;
  }
}
