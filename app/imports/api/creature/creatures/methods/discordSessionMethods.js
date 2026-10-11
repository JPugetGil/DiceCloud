import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { assertEditPermission } from '/imports/api/creature/creatures/creaturePermissions';
import { boardError } from '/imports/api/creature/creatureFolders/boardMonsters';
import { isDiscordWebhookURL } from '/imports/api/creature/log/discord/webhookUrl';
import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';
import { parseThreadLink } from '/imports/api/creature/log/discord/discordChannel';

/*
 * A character's own Discord webhook, pasted, and its sessions (D3): "New
 * session" in its Discord settings opens a forum post, or a header message in
 * a text channel, and its log goes there until "End session". For those who
 * may edit the character, as the webhook.
 */

const rateLimit = { numRequests: 5, timeInterval: 10000 };

const creatureIdSchema = { creatureId: { type: String, max: 32 } };

/** The thread a link names, or an error the interface shows; none without a link */
function threadOfLink(threadLink) {
  if (!threadLink?.trim()) return undefined;
  const thread = parseThreadLink(threadLink);
  if (!thread) throw boardError('discord.threadLink', 'discord.errors.threadLink');
  return thread;
}

async function getEditableCreature(creatureId, userId) {
  const creature = await Creatures.findOneAsync(creatureId, {
    fields: {
      name: 1, owner: 1, writers: 1, readers: 1, public: 1, type: 1, avatarPicture: 1,
      'settings.discordWebhook': 1, discordWebhookId: 1, discordWebhookChannelId: 1, discordChannel: 1,
    },
  });
  await assertEditPermission(creature, userId);
  return creature;
}

/**
 * Sets the character's pasted webhook, or removes it (and its session) when
 * empty. The URL is stored sealed (pastedWebhooks.ts): its editors get the
 * webhook's id back, never the URL. It replaces a connected channel (D4)
 */
export const setCharacterWebhook = new ValidatedMethod({
  name: 'creatures.discord.setWebhook',
  validate: new SimpleSchema({
    ...creatureIdSchema,
    webhook: { type: String, optional: true, max: STORAGE_LIMITS.url },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ creatureId, webhook }) {
    const creature = await getEditableCreature(creatureId, this.userId);
    const url = webhook?.trim();
    if (url && !isDiscordWebhookURL(url)) throw boardError('discord.invalid', 'discord.errors.invalidWebhook');
    // The server alone seals it
    if (Meteor.isServer) {
      if (creature.discordChannel) {
        const { disconnectTarget } = await import('/imports/api/creature/log/server/connectedWebhooks');
        const { discordApiBase } = await import('/imports/api/creature/log/server/webhookSender');
        await disconnectTarget(discordApiBase(), { creatureId });
      }
      if (!url) {
        await Creatures.updateAsync(creatureId, {
          $unset: { 'settings.discordWebhook': 1, discordWebhookId: 1, discordWebhookChannelId: 1, discordSession: 1 },
        });
        return;
      }
      const { pastedWebhookFields, learnPastedChannel } = await import('/imports/api/creature/log/server/pastedWebhooks');
      const { parseWebhookURL } = await import('/imports/api/creature/log/discord/webhookUrl');
      const { stored, webhookId } = /** @type {{ stored: string, webhookId: string }} */ (pastedWebhookFields(url));
      await Creatures.updateAsync(creatureId, {
        $set: { 'settings.discordWebhook': stored, discordWebhookId: webhookId },
        // Another webhook: the session and the channel were the old one's
        ...creature.discordWebhookId !== webhookId && { $unset: { discordSession: 1, discordWebhookChannelId: 1 } },
      });
      // Where it posts, asked of Discord without waiting (D6)
      learnPastedChannel({ creatureId }, /** @type {any} */ (parseWebhookURL(url))).catch(e => console.warn(e));
    }
  },
});

/** Opens a session on the character's webhook; returns its kind and name */
export const startCharacterSession = new ValidatedMethod({
  name: 'creatures.discord.startSession',
  validate: new SimpleSchema({
    ...creatureIdSchema,
    timeZone: { type: String, optional: true, max: 64 },
    // A thread of the channel to hold the session (its link), if one is chosen
    threadLink: { type: String, optional: true, max: 200 },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ creatureId, timeZone, threadLink }) {
    const creature = await getEditableCreature(creatureId, this.userId);
    const thread = threadOfLink(threadLink);
    // The server alone posts: a client may hold the settings without the webhook
    if (Meteor.isServer) {
      // Imported when called
      const { characterChannel, characterWebhook, startSession } = await import('/imports/api/creature/log/server/discordWebhooks');
      // Connected or pasted
      const webhook = await characterWebhook(creature);
      if (!webhook) throw boardError('discord.noWebhook', 'discord.errors.noWebhook');
      const session = await startSession(await characterChannel(creature, webhook), timeZone, thread);
      return { kind: session.kind, name: session.name };
    }
  },
});

/**
 * The party whose webhook is the character's own, if its rolls go there: the
 * party's session then applies to them, and the game master opens it (a
 * webhook posts each roll once). Returns `{ name }`, or null. It says nothing
 * of the party's webhook that its editor does not know: it is theirs
 */
export const characterPartyWebhook = new ValidatedMethod({
  name: 'creatures.discord.partyWebhook',
  validate: new SimpleSchema(creatureIdSchema).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: { numRequests: 10, timeInterval: 10000 },
  async run({ creatureId }) {
    const creature = await getEditableCreature(creatureId, this.userId);
    if (Meteor.isServer) {
      const { characterWebhook, destinationOf, logChannels, sameDestination } = await import('/imports/api/creature/log/server/discordWebhooks');
      const own = await characterWebhook(creature);
      if (!own) return null;
      // The same webhook, or the same channel
      const party = (await logChannels(creature))
        .find(channel => 'folderId' in channel.holder && sameDestination(destinationOf(channel), own));
      return party ? { name: party.label } : null;
    }
  },
});

/** Ends the character's session: its log goes to the channel again */
export const endCharacterSession = new ValidatedMethod({
  name: 'creatures.discord.endSession',
  validate: new SimpleSchema(creatureIdSchema).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ creatureId }) {
    await getEditableCreature(creatureId, this.userId);
    await Creatures.updateAsync(creatureId, { $unset: { discordSession: 1, discordSessionClosed: 1 } });
  },
});
