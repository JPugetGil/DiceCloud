import { Meteor } from 'meteor/meteor';

// node:crypto, on the server alone, as in secretCipher.ts
const crypto: typeof import('node:crypto') = Meteor.isServer
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? require('node:crypto') : {} as typeof import('node:crypto');

/*
 * Discord signs every interaction it sends (D6): Ed25519, over the
 * X-Signature-Timestamp header followed by the raw body, with the key of the
 * application's General Information page, `discord.publicKey` in the
 * server's settings (64 hexadecimal digits). A request whose signature is
 * wrong is refused with 401, as Discord asks (it sends some on purpose to
 * test the endpoint); so is one whose timestamp is more than five minutes
 * away from now, which would be a request played again. Without the key,
 * there is no endpoint and no command.
 */

// The DER prefix of an Ed25519 public key (SubjectPublicKeyInfo), before its 32 bytes
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** How far a request's timestamp may be from now, either way */
export const MAX_SKEW_SECONDS = 5 * 60;

let testKey: string | undefined | null = null;
let cached: { hex: string, key: import('node:crypto').KeyObject } | undefined;

/** The application's public key, from the settings; undefined without one (or with a malformed one) */
export function interactionsPublicKey(): string | undefined {
  if (testKey !== null) return testKey;
  const key = (Meteor.settings as { discord?: { publicKey?: unknown } }).discord?.publicKey;
  return typeof key === 'string' && /^[0-9a-f]{64}$/i.test(key.trim()) ? key.trim().toLowerCase() : undefined;
}

/** Replaces the public key, for a test (undefined: none); returns the one it replaced. Refused outside tests */
export function setInteractionsPublicKey(hex: string | undefined | null) {
  if (!Meteor.isTest && !Meteor.isAppTest) throw new Meteor.Error('test-only', 'Only tests replace the Discord public key');
  const previous = testKey;
  testKey = hex;
  return previous;
}

function publicKey(hex: string) {
  if (cached?.hex !== hex) {
    cached = {
      hex,
      key: crypto.createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(hex, 'hex')]), format: 'der', type: 'spki' }),
    };
  }
  return cached.key;
}

export type SignatureCheck = 'ok' | 'unsigned' | 'bad-signature' | 'stale';

/** Whether a request is Discord's, signed now; anything but 'ok' answers 401 */
export function checkSignature({ signature, timestamp, body, now = Date.now() }: {
  signature: unknown, timestamp: unknown, body: Buffer, now?: number,
}): SignatureCheck {
  const hex = interactionsPublicKey();
  if (!hex) return 'unsigned';
  if (typeof signature !== 'string' || !/^[0-9a-f]{128}$/i.test(signature)) return 'bad-signature';
  if (typeof timestamp !== 'string' || !/^\d{1,12}$/.test(timestamp)) return 'bad-signature';
  let valid: boolean;
  try {
    valid = crypto.verify(null, Buffer.concat([Buffer.from(timestamp, 'utf8'), body]), publicKey(hex), Buffer.from(signature, 'hex'));
  } catch {
    valid = false;
  }
  if (!valid) return 'bad-signature';
  if (Math.abs(now / 1000 - Number(timestamp)) > MAX_SKEW_SECONDS) return 'stale';
  return 'ok';
}
