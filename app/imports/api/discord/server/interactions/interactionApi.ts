import { Meteor } from 'meteor/meteor';
import VERSION from '/imports/constants/VERSION';
import { oauthConfig } from '/imports/api/discord/server/oauthClient';
import { discordApiBase, discordUserAgent } from '/imports/api/creature/log/server/webhookSender';

/*
 * The replies DiceCloud finishes after answering an interaction at once: the
 * deferred reply edited (PATCH /webhooks/<application>/<token>/messages/
 * @original) and the follow-up messages (POST /webhooks/<application>/
 * <token>), within the 15 minutes an interaction's token lasts. The token is
 * never stored nor logged. The requests go where the webhooks' go: Discord,
 * or in development and tests the local fake.
 */

export type InteractionTarget = { applicationId: string, token: string };

/** Where the requests go: the application's settings' API, else the webhooks' */
export function interactionsApiBase(): string | undefined {
  return oauthConfig()?.apiBase ?? discordApiBase();
}

async function send(method: 'PATCH' | 'POST', path: string, body: Record<string, unknown>): Promise<boolean> {
  const base = interactionsApiBase();
  if (!base) return false;
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'User-Agent': discordUserAgent(Meteor.absoluteUrl(), VERSION) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15 * 1000),
    });
    const text = await response.text().catch(() => '');
    if (!response.ok) {
      // What Discord answered, never the token in the address
      console.warn(`Discord: an interaction's reply was refused, ${response.status}: ${text.slice(0, 200)}`);
    }
    return response.ok;
  } catch (e) {
    console.warn(`Discord: an interaction's reply did not leave: ${(e as Error)?.message || e}`);
    return false;
  }
}

const valid = (target: InteractionTarget) => /^\d{1,32}$/.test(target.applicationId) && /^[\w.-]{1,500}$/.test(target.token);

/** Replaces the deferred reply (or the first one) with this message */
export function editOriginal(target: InteractionTarget, message: Record<string, unknown>): Promise<boolean> {
  if (!valid(target)) return Promise.resolve(false);
  return send('PATCH', `/webhooks/${target.applicationId}/${target.token}/messages/@original`, message);
}

/** Posts one more message for the interaction (flags 64: for its user alone) */
export function followUp(target: InteractionTarget, message: Record<string, unknown>): Promise<boolean> {
  if (!valid(target)) return Promise.resolve(false);
  return send('POST', `/webhooks/${target.applicationId}/${target.token}`, message);
}
