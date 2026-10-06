import { omit } from 'lodash';
import { CreatureSchema } from '/imports/api/creature/creatures/Creatures';

/*
 * A character's Discord webhook URL lets whoever holds it post in the channel
 * or delete the webhook: only those who may edit the character get it. Every
 * path that sends a character to someone who cannot edit it leaves it out:
 * the publications, the REST API and the character archive.
 *
 * Meteor's mergebox merges a document's fields from all of a client's
 * subscriptions by top-level field: `settings` from a publication that hides
 * the webhook and `settings` from one that does not would cover each other.
 * So no publication sends the webhook to someone who cannot edit the
 * character, and the ones that cannot tell send settings without it.
 */

export const WEBHOOK_FIELD = 'settings.discordWebhook';

/** A projection that leaves the webhook out (and keeps every other field) */
export const WITHOUT_WEBHOOK = { [WEBHOOK_FIELD]: 0 } as const;

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

/** A copy of a character without its webhook; the character itself if it has none */
export function creatureWithoutWebhook<T extends { settings?: { discordWebhook?: unknown } }>(creature: T): T {
  if (!creature?.settings || !('discordWebhook' in creature.settings)) return creature;
  return { ...creature, settings: omit(creature.settings, 'discordWebhook') };
}
