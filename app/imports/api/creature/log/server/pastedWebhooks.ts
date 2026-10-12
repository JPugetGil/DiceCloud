import { Meteor } from 'meteor/meteor';
import type { Mongo } from 'meteor/mongo';
import { parseWebhookURL, type Webhook } from '/imports/api/creature/log/discord/webhookUrl';
import type { DiscordResult, Requester } from '/imports/api/creature/log/server/webhookSender';
import {
  openSecret, openSecretOrWarn, sealSecret, sealedWithCurrentKey, tokenKeyStatus, SecretError,
} from '/imports/api/discord/server/secretCipher';

/*
 * The webhook URLs pasted on characters (`settings.discordWebhook`) and on
 * party boards (`discord.webhook`), stored sealed (secretCipher.ts) when the
 * server has a key, beside their webhook's id (`discordWebhookId`,
 * `discord.webhookId`), which is no secret: it is what the editors and the
 * game master get, to show "Webhook …1234" and to tell whether a session is
 * the webhook's. The URL itself, plaintext or sealed, never reaches a client
 * (webhookVisibility.ts).
 *
 * At startup, the stored values are brought there (sealStoredSecrets): the
 * tokens of the connected webhooks and the pasted URLs sealed with the
 * current key, plaintext or sealed with an old one; the ids of the pasted
 * webhooks filled in. Each value is updated only while it is still the one
 * read: the job can run again, at each start, and finds nothing to do.
 */

/** What a pasted URL is stored as: the URL, sealed when the server has a key, and its webhook's id */
export function pastedWebhookFields(url: string): { stored: string, webhookId: string } | undefined {
  const webhook = parseWebhookURL(url);
  return webhook && { stored: sealSecret(url), webhookId: webhook.id };
}

/** The webhook of a stored pasted URL, plaintext or sealed; undefined, with a warning, when it cannot be read */
export function pastedWebhook(stored?: string): Webhook | undefined {
  return parseWebhookURL(openSecretOrWarn(stored, 'a pasted webhook URL'));
}

/** Whether a stored pasted URL is the URL of a webhook, its token included */
export function isPastedWebhook(stored: string | undefined, webhook: Webhook): boolean {
  const found = pastedWebhook(stored);
  return found?.id === webhook.id && found.token === webhook.token;
}

/**
 * The channel a webhook posts in, as Discord says when asked for the webhook
 * (GET, through its queue, or with the requester of a task of that queue,
 * which must not wait for its own queue); undefined when nothing posts to
 * Discord or it does not say
 */
export async function askWebhookChannel(webhook: Webhook, request?: Requester): Promise<string | undefined> {
  let result: DiscordResult | undefined;
  if (request) {
    result = await request({ method: 'GET', body: {} });
  } else {
    // Imported when called: discordWebhooks.ts imports this module
    const { webhookSender } = await import('/imports/api/creature/log/server/discordWebhooks');
    const target = webhookSender();
    if (!target || target.isGone(webhook)) return undefined;
    result = await target.enqueue(webhook, ask => ask({ method: 'GET', body: {} }));
  }
  const channelId = result?.ok ? result.message?.channel_id : undefined;
  return typeof channelId === 'string' && /^\d{1,32}$/.test(channelId) ? channelId : undefined;
}

/**
 * Learns where a character's or a party's pasted webhook posts, and keeps it
 * while it is still that webhook: to find a party's channel from a command,
 * and to post a roll there once (D6). Returns the channel
 */
export async function learnPastedChannel(
  holder: { creatureId: string } | { folderId: string }, webhook: Webhook | undefined, request?: Requester,
): Promise<string | undefined> {
  if (!webhook) return undefined;
  const channelId = await askWebhookChannel(webhook, request);
  if (!channelId) return undefined;
  if ('creatureId' in holder) {
    const { default: Creatures } = await import('/imports/api/creature/creatures/Creatures');
    await Creatures.updateAsync({ _id: holder.creatureId, discordWebhookId: webhook.id }, { $set: { discordWebhookChannelId: channelId } });
  } else {
    const { default: CreatureFolders } = await import('/imports/api/creature/creatureFolders/CreatureFolders');
    await (CreatureFolders as unknown as Mongo.Collection<any>).updateAsync(
      { _id: holder.folderId, 'discord.webhookId': webhook.id }, { $set: { 'discord.webhookChannelId': channelId } });
  }
  return channelId;
}

/**
 * Keeps what a character's or a party's pasted webhook's channel is, while it
 * is still that webhook: a forum, or a text channel, as Discord or its bot
 * said. "New session" goes straight to the right way, and says at once when
 * a text channel lacks the bot (discordSessions.ts)
 */
export async function rememberPastedKind(
  holder: { creatureId: string } | { folderId: string }, webhookId: string, kind: 'text' | 'forum',
) {
  if ('creatureId' in holder) {
    const { default: Creatures } = await import('/imports/api/creature/creatures/Creatures');
    await Creatures.updateAsync({ _id: holder.creatureId, discordWebhookId: webhookId }, { $set: { discordWebhookChannelKind: kind } });
  } else {
    const { default: CreatureFolders } = await import('/imports/api/creature/creatureFolders/CreatureFolders');
    await (CreatureFolders as unknown as Mongo.Collection<any>).updateAsync(
      { _id: holder.folderId, 'discord.webhookId': webhookId }, { $set: { 'discord.webhookChannelKind': kind } });
  }
}

type Counts = { sealed: number, ids: number, unreadable: number };

// A field's value, by its dotted path
const valueAt = (doc: any, path: string) => path.split('.').reduce((object, key) => object?.[key], doc);

// One field of one collection: seals what is not sealed with the current key,
// and fills the pasted webhooks' ids in
async function sealField(collection: Mongo.Collection<any>, field: string, idField?: string): Promise<Counts> {
  const counts: Counts = { sealed: 0, ids: 0, unreadable: 0 };
  const current = sealedWithCurrentKey();
  const raw = collection.rawCollection();
  const selector = {
    [field]: { $exists: true, $type: 'string' },
    $or: [
      // Without a key, the sealed ones are only counted when unreadable
      current ? { [field]: { $not: current } } : { [field]: /^enc1\./ },
      ...idField ? [{ [idField]: { $exists: false } }] : [],
    ],
  };
  for await (const doc of raw.find(selector, { projection: { [field]: 1, ...idField && { [idField]: 1 } } })) {
    const stored = valueAt(doc, field) as string;
    let plain: string;
    try {
      plain = openSecret(stored);
    } catch (e) {
      if (!(e instanceof SecretError)) throw e;
      counts.unreadable += 1;
      continue;
    }
    const $set: Record<string, string> = {};
    if (current && !current.test(stored)) $set[field] = sealSecret(plain);
    const webhookId = idField ? parseWebhookURL(plain)?.id : undefined;
    if (idField && webhookId && valueAt(doc, idField) !== webhookId) $set[idField] = webhookId;
    if (!Object.keys($set).length) continue;
    // Only while it is still the value read
    const result = await raw.updateOne({ _id: doc._id, [field]: stored }, { $set });
    if (!result.modifiedCount) continue;
    if ($set[field]) counts.sealed += 1;
    if (idField && $set[idField]) counts.ids += 1;
  }
  return counts;
}

/**
 * Seals the stored webhook tokens and URLs with the current key, and fills
 * the pasted webhooks' ids in. Without a key, the ids alone; and it counts
 * the values sealed with a key the server lacks. Idempotent
 */
export async function sealStoredSecrets() {
  const [{ ConnectedWebhooks }, { default: Creatures }, { default: CreatureFolders }] = await Promise.all([
    import('/imports/api/creature/log/server/connectedWebhooks'),
    import('/imports/api/creature/creatures/Creatures'),
    import('/imports/api/creature/creatureFolders/CreatureFolders'),
  ]);
  const connected = await sealField(ConnectedWebhooks as unknown as Mongo.Collection<any>, 'token');
  const creatures = await sealField(Creatures as unknown as Mongo.Collection<any>, 'settings.discordWebhook', 'discordWebhookId');
  const folders = await sealField(CreatureFolders as unknown as Mongo.Collection<any>, 'discord.webhook', 'discord.webhookId');
  return { connected, creatures, folders };
}

/** The startup job, and what it says */
async function sealAtStartup() {
  const { sealing, keyId, problems } = tokenKeyStatus();
  for (const problem of problems) console.error(`Discord: ${problem}: ignored`);
  const { connected, creatures, folders } = await sealStoredSecrets();
  const sealed = connected.sealed + creatures.sealed + folders.sealed;
  const unreadable = connected.unreadable + creatures.unreadable + folders.unreadable;
  if (!sealing) {
    console.warn('Discord: no discord.tokenKey in the settings: the webhooks\' tokens are stored in plaintext '
      + '(README.md, "The webhooks\' key")');
  } else if (sealed) {
    console.log(`Discord: ${sealed} webhook token(s) or URL(s) sealed with the key ${keyId}`);
  }
  if (unreadable) {
    console.warn(`Discord: ${unreadable} webhook token(s) or URL(s) sealed with a key this server lacks: `
      + 'unused until the key is back in discord.tokenKey or discord.oldTokenKeys, or until they are connected or pasted again');
  }
}

// Not under tests, which call sealStoredSecrets with keys of their own
if (!Meteor.isTest && !Meteor.isAppTest) {
  Meteor.startup(() => {
    sealAtStartup().catch(e => console.error('Discord: the webhooks\' tokens were not sealed', e));
  });
}

