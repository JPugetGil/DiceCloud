import { omit } from 'lodash';
import { CreatureSchema } from '/imports/api/creature/creatures/Creatures';

/*
 * A character's Discord webhook URL lets whoever holds it post in the channel
 * or delete the webhook: no client ever gets it, plaintext or sealed
 * (pastedWebhooks.ts), its editors included. Those who may edit the
 * character get its webhook's id instead (`discordWebhookId`, shown as
 * "Webhook …1234"), with the channel connected instead (D4) and the session
 * its messages go into (discordSession.ts); the others get none of these.
 * Every path that sends a character to a client follows this: the
 * publications, the REST API and the character archive. A party's own
 * webhook and session are its folder's `discord` field, the game master's
 * alone, the URL left out for them too.
 *
 * Meteor's mergebox merges a document's fields from all of a client's
 * subscriptions by top-level field: `settings` from a publication that hides
 * the webhook and `settings` from one that does not would cover each other.
 * So no publication sends the webhook at all, and the ones that list the
 * fields they send leave it out of the settings. The session, the channel
 * and the webhook's id are top-level fields of their own: those publications
 * leave them out.
 */

export const WEBHOOK_FIELD = 'settings.discordWebhook';
export const SESSION_FIELD = 'discordSession';
// The channel connected instead (D4): its webhook's id, and where it posts
export const CHANNEL_FIELD = 'discordChannel';
// The pasted webhook's id: no secret, but its editors' business alone
export const WEBHOOK_ID_FIELD = 'discordWebhookId';

/** A projection for the character's editors: everything but the webhook's URL */
export const WITHOUT_WEBHOOK_URL = { [WEBHOOK_FIELD]: 0 } as const;

/** A projection for everyone else: neither the webhook, nor its id, channel and session (every other field kept) */
export const WITHOUT_WEBHOOK = { [WEBHOOK_FIELD]: 0, [SESSION_FIELD]: 0, [CHANNEL_FIELD]: 0, [WEBHOOK_ID_FIELD]: 0 } as const;

/** What a party's players never get of its folder: its Discord webhook and session */
export const PARTY_DISCORD_FIELD = 'discord';

/** What its game master never gets either: the pasted URL */
export const PARTY_WEBHOOK_FIELD = 'discord.webhook';

/**
 * The fields of the settings but the webhook, for a publication that lists
 * the fields it sends: a projection cannot both include fields and exclude one
 */
export function settingsFieldsWithoutWebhook(): Record<string, 1> {
  const fields: Record<string, 1> = {};
  // SimpleSchema's objectKeys, which its typings here lack
  const schema = CreatureSchema as unknown as { objectKeys(prefix: string): string[] };
  for (const key of schema.objectKeys('settings')) {
    if (`settings.${key}` !== WEBHOOK_FIELD) fields[`settings.${key}`] = 1;
  }
  return fields;
}

type WithWebhook = {
  settings?: { discordWebhook?: unknown },
  discordSession?: unknown,
  discordChannel?: unknown,
  discordWebhookId?: unknown,
};

// A copy without the webhook's URL and those top-level fields; the character itself if it has none
function without<T extends WithWebhook>(creature: T, fields: string[]): T {
  const hasUrl = !!creature?.settings && 'discordWebhook' in creature.settings;
  const others = fields.filter(field => !!creature && field in creature);
  if (!hasUrl && !others.length) return creature;
  const copy = omit(creature, others) as T;
  if (hasUrl) copy.settings = omit(creature.settings, 'discordWebhook');
  return copy;
}

/** A copy of a character for its editors: without its webhook's URL */
export function creatureWithoutWebhookUrl<T extends WithWebhook>(creature: T): T {
  return without(creature, []);
}

/** A copy of a character for anyone else: without its webhook, its id, channel and session */
export function creatureWithoutWebhook<T extends WithWebhook>(creature: T): T {
  return without(creature, [SESSION_FIELD, CHANNEL_FIELD, WEBHOOK_ID_FIELD]);
}

/**
 * A copy of a character without anything of Discord, for a file: an archive,
 * which its owner can download, holds neither the webhook's URL (sealed or
 * not) nor its id, channel and session; a file restored or imported, which
 * can say anything, sets none of them (a channel is a webhook of DiceCloud's,
 * by its id)
 */
export function creatureWithoutDiscord<T extends WithWebhook>(creature: T): T {
  return without(creature, [SESSION_FIELD, CHANNEL_FIELD, WEBHOOK_ID_FIELD]);
}

/** A copy of a character for whoever `canEdit` says */
export function creatureForClient<T extends WithWebhook>(creature: T, canEdit: boolean): T {
  return canEdit ? creatureWithoutWebhookUrl(creature) : creatureWithoutWebhook(creature);
}
