import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import { getPartyRole } from '/imports/api/creature/creatureFolders/party';
import { boardError } from '/imports/api/creature/creatureFolders/boardMonsters';
import { isDiscordWebhookURL, parseWebhookURL } from '/imports/api/creature/log/discord/webhookUrl';
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

// The browser's time zone, which the session's date is written in
const timeZoneSchema = { timeZone: { type: String, optional: true, max: 64 } };

/** Sets the party's webhook, or removes it (and its session) when empty */
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
    if (!url) {
      await CreatureFolders.updateAsync(folderId, { $unset: { discord: 1, discordPosting: 1 } });
      return;
    }
    if (!isDiscordWebhookURL(url)) {
      throw boardError('discord.invalid', 'discord.errors.invalidWebhook');
    }
    // Another webhook: the session and the fight's message were the old one's.
    // What it posts stays as the game master chose: all of it at first
    const sameWebhook = parseWebhookURL(folder.discord?.webhook)?.id === parseWebhookURL(url)?.id;
    // What the players learn of it
    const posting = postingSummary({ ...folder.discord, webhook: url });
    const $unset = {
      ...!posting && { discordPosting: 1 },
      ...!sameWebhook && folder.discord && { 'discord.session': 1, 'discord.initiative': 1 },
    };
    await CreatureFolders.updateAsync(folderId, {
      $set: { 'discord.webhook': url, ...posting && { discordPosting: posting } },
      ...Object.keys($unset).length && { $unset },
    });
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
    if (!folder.discord?.webhook) throw boardError('discord.noWebhook', 'discord.errors.noWebhook');
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
  async run({ folderId, timeZone }) {
    const folder = await getFolderAsGm(folderId, this.userId);
    // The server alone posts: a client may hold the settings without the webhook
    if (Meteor.isServer) {
      const webhook = parseWebhookURL(folder.discord?.webhook);
      if (!webhook) throw boardError('discord.noWebhook', 'discord.errors.noWebhook');
      if (!publishes(folder.discord, 'sessions')) throw boardError('discord.sessionsOff', 'discord.errors.sessionsOff');
      // Imported when called
      const { partyChannel, startSession } = await import('/imports/api/creature/log/server/discordWebhooks');
      const session = await startSession(await partyChannel(folder, webhook), timeZone);
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
    await CreatureFolders.updateAsync(folderId, { $unset: { 'discord.session': 1 } });
  },
});
