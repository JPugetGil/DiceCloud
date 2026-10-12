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
 * "New session" opens a forum post, or in a text channel a thread the bot
 * creates, that everything goes into until "End session"; "Resume a session"
 * goes back into one of the last ones (discordSessions.ts). The game master
 * chooses what it posts (partyPublishing.ts). The URL, the sessions and the
 * last ones are the game master's alone (the folder's `discord` field); the
 * players only learn what the party posts, rolls or fights (`discordPosting`).
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
const timeZoneSchema = {
  timeZone: { type: String, optional: true, max: 64 },
};

// What browsers of before 2026-10-12 may still ask: a session in a thread
// whose link they paste, refused; the bot's thread, which every new session
// in a text channel now is
export const removedSessionModes = {
  threadLink: { type: String, optional: true, max: 200 },
  newThread: { type: Boolean, optional: true },
};

/** Refuses the ways to open a session there are no more */
export function refuseRemovedModes({ threadLink }) {
  if (threadLink !== undefined) throw boardError('discord.modeRemoved', 'discord.errors.modeRemoved');
}

// The thread of a session to resume: its id, as the last sessions keep it
export const threadIdSchema = { threadId: { type: String, regEx: /^\d{1,32}$/ } };

/**
 * The party's channel for its sessions (server only): its webhook, connected
 * or pasted, unless it has none or the game master turned the sessions off
 */
async function sessionsChannel(folder) {
  if (Meteor.isServer) {
    // Imported when called
    const { partyChannel, partyWebhook } = await import('/imports/api/creature/log/server/discordWebhooks');
    const webhook = await partyWebhook(folder.discord);
    if (!webhook) throw boardError('discord.noWebhook', 'discord.errors.noWebhook');
    if (!publishes(folder.discord, 'sessions')) throw boardError('discord.sessionsOff', 'discord.errors.sessionsOff');
    return partyChannel(folder, webhook);
  }
  // Only the server calls it
  throw new Meteor.Error('server-only', 'The server alone opens sessions');
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
      ...!sameWebhook && folder.discord && {
        'discord.session': 1, 'discord.initiative': 1, 'discord.webhookChannelId': 1, 'discord.webhookChannelKind': 1,
      },
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
 * and the party, or in a text channel a thread the bot creates. Returns its
 * kind ('forum' or 'thread') and name once Discord has answered
 */
export const startPartySession = new ValidatedMethod({
  name: 'creatureFolders.discord.startSession',
  validate: new SimpleSchema({ ...folderIdSchema, ...timeZoneSchema, ...removedSessionModes }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId, timeZone, threadLink }) {
    const folder = await getFolderAsGm(folderId, this.userId);
    refuseRemovedModes({ threadLink });
    // The server alone posts: a client may hold the settings without the webhook
    if (Meteor.isServer) {
      const channel = await sessionsChannel(folder);
      const { newSession } = await import('/imports/api/creature/log/server/discordSessions');
      const session = await newSession(channel, timeZone);
      return { kind: session.kind, name: session.name };
    }
  },
});

/**
 * Resumes one of the party's last sessions, of the channel it posts in now:
 * returns its kind and name once Discord took "The session goes on" there
 */
export const resumePartySession = new ValidatedMethod({
  name: 'creatureFolders.discord.resumeSession',
  validate: new SimpleSchema({ ...folderIdSchema, ...threadIdSchema, ...timeZoneSchema }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId, threadId, timeZone }) {
    const folder = await getFolderAsGm(folderId, this.userId);
    if (Meteor.isServer) {
      const channel = await sessionsChannel(folder);
      const { resumeSession } = await import('/imports/api/creature/log/server/discordSessions');
      const session = await resumeSession(channel, threadId, timeZone);
      return { kind: session.kind, name: session.name, resumed: true };
    }
  },
});

/**
 * Whether "New session" can work on the party's channel: `{ newSession:
 * 'noBot' }` for a text channel the bot cannot create a thread in
 */
export const partySessionAvailability = new ValidatedMethod({
  name: 'creatureFolders.discord.sessionAvailability',
  validate: new SimpleSchema(folderIdSchema).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: { numRequests: 10, timeInterval: 10000 },
  async run({ folderId }) {
    const folder = await getFolderAsGm(folderId, this.userId);
    if (Meteor.isServer) {
      const { partyChannel, partyWebhook } = await import('/imports/api/creature/log/server/discordWebhooks');
      const webhook = await partyWebhook(folder.discord);
      if (!webhook) return { newSession: 'ready' };
      const { sessionAvailability } = await import('/imports/api/creature/log/server/discordSessions');
      return sessionAvailability(await partyChannel(folder, webhook));
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
