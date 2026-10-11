import { Mongo } from 'meteor/mongo';
import { Meteor } from 'meteor/meteor';
import Creatures from '/imports/api/creature/creatures/Creatures';
import type { Webhook } from '/imports/api/creature/log/discord/webhookUrl';
import type { DiscordChannel } from '/imports/api/creature/log/discord/discordChannel';
import { postingSummary } from '/imports/api/creature/log/discord/partyPublishing';
import type { OAuthTarget } from '/imports/api/discord/server/oauthStates';
import {
  deleteWebhook, webhookExists, type ExchangedWebhook,
} from '/imports/api/discord/server/oauthClient';
import { openSecretOrWarn, sealSecret } from '/imports/api/discord/server/secretCipher';

/*
 * The webhooks "Connect to Discord" (D4) creates: DiceCloud's application
 * owns them, Discord hands their token over once, at the authorization, and
 * this server-only collection is the one place that keeps it, sealed when the
 * server has a key (secretCipher.ts). Characters and party boards point at
 * one by its id (discordChannel.ts); no publication, method or API ever sends
 * a token to a client.
 *
 * One webhook per channel: a second authorization for a channel that has one
 * keeps the one already there, while Discord still knows it, and deletes the
 * new one; Discord allows 15 webhooks per channel. A webhook no character
 * nor board points at any more is deleted, from Discord too.
 */

type ConnectedWebhook = {
  _id: string,
  webhookId: string,
  // Sealed with the server's key, if it has one
  token: string,
  channelId: string,
  guildId: string,
  applicationId?: string,
  createdBy?: string,
  createdAt: Date,
};

export const ConnectedWebhooks = new Mongo.Collection<ConnectedWebhook>('discordWebhooks');

Meteor.startup(async () => {
  const raw = ConnectedWebhooks.rawCollection();
  await raw.createIndex({ channelId: 1 }, { unique: true });
  await raw.createIndex({ webhookId: 1 }, { unique: true });
});

// The folders collection, imported when used, as in discordWebhooks.ts
async function creatureFolders() {
  const { default: CreatureFolders } = await import('/imports/api/creature/creatureFolders/CreatureFolders');
  return CreatureFolders as unknown as Mongo.Collection<any>;
}

// A stored webhook's id and token, readable; undefined when its token cannot be opened
function readable(doc: ConnectedWebhook): Webhook | undefined {
  const token = openSecretOrWarn(doc.token, `the token of the connected webhook ${doc.webhookId}`);
  return token ? { id: doc.webhookId, token } : undefined;
}

/** A connected webhook's id and token, for the sender; undefined if it is not one of DiceCloud's */
export async function connectedWebhook(webhookId?: string): Promise<(Webhook & { channelId: string, guildId?: string }) | undefined> {
  if (!webhookId) return undefined;
  const doc = await ConnectedWebhooks.findOneAsync({ webhookId });
  const webhook = doc && readable(doc);
  return webhook && { ...webhook, channelId: doc.channelId, ...doc.guildId && { guildId: doc.guildId } };
}

// The selectors of the characters and boards pointing at a webhook
const creaturesOf = (webhookId: string) => ({ 'discordChannel.webhookId': webhookId });
const foldersOf = (webhookId: string) => ({ 'discord.channel.webhookId': webhookId });

/** Deletes a webhook, from Discord too, once nothing points at it */
export async function releaseWebhook(apiBase: string | undefined, webhookId?: string) {
  if (!webhookId) return;
  const CreatureFolders = await creatureFolders();
  const used = await Creatures.findOneAsync(creaturesOf(webhookId), { fields: { _id: 1 } })
    || await CreatureFolders.findOneAsync(foldersOf(webhookId), { fields: { _id: 1 } });
  if (used) return;
  const doc = await ConnectedWebhooks.findOneAsync({ webhookId });
  if (!doc) return;
  if (apiBase) {
    // A token the server cannot open any more (its key lost): forgotten, the
    // webhook left in the channel, where a server's admin can remove it
    const webhook = readable(doc);
    try {
      if (webhook) await deleteWebhook(apiBase, webhook);
    } catch (e) {
      // Kept, to try again: it is still DiceCloud's
      console.warn(`Discord webhook ${doc.webhookId} not deleted: ${(e as Error).message}`);
      return;
    }
  }
  await ConnectedWebhooks.removeAsync(doc._id);
}

/**
 * The webhook a new authorization made, or the one its channel had: one per
 * channel. Returns the webhook the target is to point at
 */
async function oneForTheChannel(apiBase: string, webhook: ExchangedWebhook, userId: string): Promise<ConnectedWebhook> {
  const existing = await ConnectedWebhooks.findOneAsync({ channelId: webhook.channelId });
  if (existing && existing.webhookId !== webhook.id) {
    // One whose token the server cannot open any more (its key lost) is
    // replaced, as one Discord no longer knows
    const usable = readable(existing);
    if (usable && await webhookExists(apiBase, usable)) {
      // The channel's own: the new one goes
      await deleteWebhook(apiBase, webhook);
      return existing;
    }
    // Discord no longer knows it (an admin removed it), or the server cannot
    // use it: the new one replaces it, for everything that pointed at it
    await ConnectedWebhooks.removeAsync(existing._id);
    await repoint(existing.webhookId, webhook);
  } else if (existing) {
    return existing;
  }
  const doc: ConnectedWebhook = {
    _id: webhook.id,
    webhookId: webhook.id,
    token: sealSecret(webhook.token),
    channelId: webhook.channelId,
    guildId: webhook.guildId,
    ...webhook.applicationId && { applicationId: String(webhook.applicationId) },
    createdBy: userId,
    createdAt: new Date(),
  };
  await ConnectedWebhooks.insertAsync(doc);
  return doc;
}

// What pointed at a webhook now gone points at its channel's new one; the
// sessions and the fight's message were the old one's
async function repoint(oldWebhookId: string, webhook: ExchangedWebhook) {
  const channel = { webhookId: webhook.id, guildId: webhook.guildId, channelId: webhook.channelId, connectedAt: new Date() };
  await Creatures.updateAsync(creaturesOf(oldWebhookId),
    { $set: { discordChannel: channel }, $unset: { discordSession: 1 } }, { multi: true });
  const CreatureFolders = await creatureFolders();
  await CreatureFolders.updateAsync(foldersOf(oldWebhookId),
    { $set: { 'discord.channel': channel }, $unset: { 'discord.session': 1, 'discord.initiative': 1 } }, { multi: true });
}

/**
 * Connects a character or a party board to the webhook an authorization made
 * (or its channel's): it replaces a pasted webhook, and a channel connected
 * before, which is deleted if nothing else points at it
 */
export async function connectTarget({ apiBase, target, userId, webhook }: {
  apiBase: string, target: OAuthTarget, userId: string, webhook: ExchangedWebhook,
}): Promise<DiscordChannel> {
  const kept = await oneForTheChannel(apiBase, webhook, userId);
  const channel: DiscordChannel = {
    webhookId: kept.webhookId, guildId: kept.guildId, channelId: kept.channelId, connectedAt: new Date(),
  };
  let previous: string | undefined;
  if ('creatureId' in target) {
    const creature = await Creatures.findOneAsync(target.creatureId, { fields: { discordChannel: 1 } });
    previous = creature?.discordChannel?.webhookId;
    await Creatures.updateAsync(target.creatureId, {
      $set: { discordChannel: channel },
      $unset: {
        'settings.discordWebhook': 1, discordWebhookId: 1, discordWebhookChannelId: 1,
        ...previous !== kept.webhookId && { discordSession: 1 },
      },
    });
  } else {
    const CreatureFolders = await creatureFolders();
    const folder = await CreatureFolders.findOneAsync(target.folderId, { fields: { discord: 1 } });
    previous = folder?.discord?.channel?.webhookId;
    const posting = postingSummary({ ...folder?.discord, webhook: undefined, webhookId: undefined, channel });
    await CreatureFolders.updateAsync(target.folderId, {
      $set: { 'discord.channel': channel, ...posting && { discordPosting: posting } },
      $unset: {
        'discord.webhook': 1,
        'discord.webhookId': 1,
        'discord.webhookChannelId': 1,
        ...!posting && { discordPosting: 1 },
        ...previous !== kept.webhookId && { 'discord.session': 1, 'discord.initiative': 1 },
      },
    });
  }
  if (previous && previous !== kept.webhookId) await releaseWebhook(apiBase, previous);
  return channel;
}

/** Disconnects a character or a party board; its webhook goes once nothing points at it */
export async function disconnectTarget(apiBase: string | undefined, target: OAuthTarget) {
  let previous: string | undefined;
  if ('creatureId' in target) {
    const creature = await Creatures.findOneAsync(target.creatureId, { fields: { discordChannel: 1 } });
    previous = creature?.discordChannel?.webhookId;
    if (!previous) return;
    await Creatures.updateAsync(target.creatureId, { $unset: { discordChannel: 1, discordSession: 1 } });
  } else {
    const CreatureFolders = await creatureFolders();
    const folder = await CreatureFolders.findOneAsync(target.folderId, { fields: { discord: 1 } });
    previous = folder?.discord?.channel?.webhookId;
    if (!previous) return;
    // What it posts stays as the game master chose, for the next channel
    await CreatureFolders.updateAsync(target.folderId, {
      $unset: { 'discord.channel': 1, 'discord.session': 1, 'discord.initiative': 1, discordPosting: 1 },
    });
  }
  await releaseWebhook(apiBase, previous);
}

/**
 * A connected webhook Discord no longer knows (404, 10015: a server's admin
 * removed DiceCloud's integration): forgotten, with what pointed at it.
 * Returns how many characters and boards pointed at it
 */
export async function forgetConnectedWebhook(webhookId: string): Promise<number> {
  const removed = await ConnectedWebhooks.removeAsync({ webhookId });
  const creatures = await Creatures.updateAsync(creaturesOf(webhookId),
    { $unset: { discordChannel: 1, discordSession: 1 } }, { multi: true });
  const CreatureFolders = await creatureFolders();
  const folders = await CreatureFolders.updateAsync(foldersOf(webhookId),
    { $unset: { 'discord.channel': 1, 'discord.session': 1, 'discord.initiative': 1, discordPosting: 1 } }, { multi: true });
  return removed ? creatures + folders : 0;
}

/** How many Discord servers and channels DiceCloud's webhooks post to, for the administrators */
export async function connectedCounts(): Promise<{ servers: number, channels: number }> {
  const raw = ConnectedWebhooks.rawCollection();
  const [servers, channels] = await Promise.all([raw.distinct('guildId'), raw.countDocuments()]);
  return { servers: servers.filter(Boolean).length, channels };
}
