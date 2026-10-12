import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import { getPartyRole } from '/imports/api/creature/creatureFolders/party';
import { boardError } from '/imports/api/creature/creatureFolders/boardMonsters';
import { isDiscordWebhookURL, parseWebhookURL } from '/imports/api/creature/log/discord/webhookUrl';
import { parseThreadLink } from '/imports/api/creature/log/discord/discordChannel';
import { PUBLISH_KINDS, postingSummary, publishes } from '/imports/api/creature/log/discord/partyPublishing';
import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';

/*
 * A party's Discord channel (D2, D3): its game master pastes a webhook's URL
 * on the board, and the party's fights and its characters' rolls go there;
 * "New session" opens a forum post (or, in a text channel, a header message)
 * that everything goes into until "End session". The game master chooses
 * what it posts (partyPublishing.ts). The URL and the session are the game
 * master's alone (the folder's `discord` field); the players only learn what
 * the party posts, rolls or fights (`discordPosting`).
 */

const rateLimit = { numRequests: 5, timeInterval: 10000 };

async function getFolderAsGm(folderId, userId) {
  const folder = userId && await CreatureFolders.findOneAsync(folderId);
  if (getPartyRole(folder, userId) !== 'gm') {
    throw boardError('discord.denied', 'discord.errors.denied');
  }
  return folder;
}

const folderIdSchema = { folderId: { type: String, max: 32 } };

// The browser's time zone, which the session's date is written in; and the
// link of a thread of the channel to hold the session, if one is chosen
const timeZoneSchema = {
  timeZone: { type: String, optional: true, max: 64 },
  threadLink: { type: String, optional: true, max: 200 },
  // A new thread the bot creates in the connected text channel (phase D)
  newThread: { type: Boolean, optional: true },
};

/** The thread a link names, or an error the interface shows; none without a link */
export function threadOfLink(threadLink) {
  if (!threadLink?.trim()) return undefined;
  const thread = parseThreadLink(threadLink);
  if (!thread) throw boardError('discord.threadLink', 'discord.errors.threadLink');
  return thread;
}

/**
 * Sets the party's webhook, or removes it (and its session) when empty. The
 * URL is stored sealed (pastedWebhooks.ts): the game master gets the
 * webhook's id back, never the URL
 */
export const setPartyWebhook = new ValidatedMethod({
  name: 'creatureFolders.discord.setWebhook',
  validate: new SimpleSchema({
    ...folderIdSchema,
    webhook: { type: String, optional: true, max: STORAGE_LIMITS.url },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId, webhook }) {
    const folder = await getFolderAsGm(folderId, this.userId);
    const url = webhook?.trim();
    if (url && !isDiscordWebhookURL(url)) {
      throw boardError('discord.invalid', 'discord.errors.invalidWebhook');
    }
    // The server alone seals it
    if (!Meteor.isServer) return;
    // A pasted webhook replaces a connected channel (D4), whose webhook goes
    // once nothing else uses it
    if (folder.discord?.channel) {
      const { disconnectTarget } = await import('/imports/api/creature/log/server/connectedWebhooks');
      const { discordApiBase } = await import('/imports/api/creature/log/server/webhookSender');
      await disconnectTarget(discordApiBase(), { folderId });
      folder.discord = { ...folder.discord, channel: undefined };
    }
    if (!url) {
      await CreatureFolders.updateAsync(folderId, { $unset: { discord: 1, discordPosting: 1 } });
      return;
    }
    const { pastedWebhookFields, learnPastedChannel } = await import('/imports/api/creature/log/server/pastedWebhooks');
    const { stored, webhookId } = /** @type {{ stored: string, webhookId: string }} */ (pastedWebhookFields(url));
    // Another webhook: the session and the fight's message were the old one's.
    // What it posts stays as the game master chose: all of it at first
    const sameWebhook = folder.discord?.webhookId === webhookId;
    // What the players learn of it
    const posting = postingSummary({ ...folder.discord, webhook: stored, webhookId });
    const $unset = {
      ...!posting && { discordPosting: 1 },
      ...!sameWebhook && folder.discord && { 'discord.session': 1, 'discord.initiative': 1, 'discord.webhookChannelId': 1 },
    };
    await CreatureFolders.updateAsync(folderId, {
      $set: { 'discord.webhook': stored, 'discord.webhookId': webhookId, ...posting && { discordPosting: posting } },
      ...Object.keys($unset).length && { $unset },
    });
    // Where it posts, asked of Discord without waiting (D6)
    learnPastedChannel({ folderId }, parseWebhookURL(url)).catch(e => console.warn(e));
  },
});

/**
 * Turns the party's publishing on or off (`enabled`), or some kinds of its
 * messages (`publish`, by kind: initiative, turns, combat, rolls, sessions)
 */
export const setPartyPublishing = new ValidatedMethod({
  name: 'creatureFolders.discord.setPublishing',
  validate: new SimpleSchema({
    ...folderIdSchema,
    enabled: { type: Boolean, optional: true },
    publish: { type: Object, optional: true },
    ...Object.fromEntries(PUBLISH_KINDS.map(kind => [`publish.${kind}`, { type: Boolean, optional: true }])),
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: { numRequests: 10, timeInterval: 5000 },
  async run({ folderId, enabled, publish = {} }) {
    const folder = await getFolderAsGm(folderId, this.userId);
    if (!folder.discord?.webhook && !folder.discord?.webhookId && !folder.discord?.channel) {
      throw boardError('discord.noWebhook', 'discord.errors.noWebhook');
    }
    const $set = {};
    if (enabled !== undefined) $set['discord.enabled'] = enabled;
    for (const kind of PUBLISH_KINDS) {
      if (publish[kind] !== undefined) $set[`discord.publish.${kind}`] = publish[kind];
    }
    // What the players learn of it
    const posting = postingSummary({
      ...folder.discord,
      ...enabled !== undefined && { enabled },
      publish: { ...folder.discord.publish, ...publish },
    });
    await CreatureFolders.updateAsync(folderId, posting
      ? { $set: { ...$set, discordPosting: posting } }
      : { $set, $unset: { discordPosting: 1 } });
  },
});

/**
 * Opens a session on the party's channel: a forum post named after the date
 * and the party, or a header message in a text channel. Returns its kind
 * ('forum' or 'channel') and name once Discord has answered
 */
export const startPartySession = new ValidatedMethod({
  name: 'creatureFolders.discord.startSession',
  validate: new SimpleSchema({ ...folderIdSchema, ...timeZoneSchema }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId, timeZone, threadLink, newThread }) {
    const folder = await getFolderAsGm(folderId, this.userId);
    const thread = threadOfLink(threadLink);
    // Only in a text channel connected for this party: never one the bot was not shown
    if (newThread && (!folder.discord?.channel || folder.discord.channel.kind === 'forum')) {
      throw boardError('discord.botUnavailable', 'discord.errors.botUnavailable', { status: '–' });
    }
    // The server alone posts: a client may hold the settings without the webhook
    if (Meteor.isServer) {
      // Imported when called
      const { partyChannel, partyWebhook, startSession } = await import('/imports/api/creature/log/server/discordWebhooks');
      // Connected or pasted
      const webhook = await partyWebhook(folder.discord);
      if (!webhook) throw boardError('discord.noWebhook', 'discord.errors.noWebhook');
      if (!publishes(folder.discord, 'sessions')) throw boardError('discord.sessionsOff', 'discord.errors.sessionsOff');
      const channel = await partyChannel(folder, webhook);
      let session;
      if (newThread) {
        const { startBotThreadSession } = await import('/imports/api/discord/server/botSessions');
        session = await startBotThreadSession(channel, timeZone);
      } else {
        session = await startSession(channel, timeZone, thread);
      }
      return { kind: session.kind, name: session.name };
    }
  },
});

/** Ends the party's session: its messages go to the channel again */
export const endPartySession = new ValidatedMethod({
  name: 'creatureFolders.discord.endSession',
  validate: new SimpleSchema(folderIdSchema).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId }) {
    await getFolderAsGm(folderId, this.userId);
    await CreatureFolders.updateAsync(folderId, { $unset: { 'discord.session': 1, 'discord.sessionClosed': 1 } });
  },
});
