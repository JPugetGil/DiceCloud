import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { assertEditPermission } from '/imports/api/creature/creatures/creaturePermissions';
import { getPartyRole } from '/imports/api/creature/creatureFolders/party';
import { boardError, GM_CREATURE_TYPES } from '/imports/api/creature/creatureFolders/boardMonsters';
import { assertAdmin } from '/imports/api/sharing/sharingPermissions';
import { NONCE_HASH } from '/imports/api/discord/discordNonce';

/*
 * DiceCloud's Discord application (phase B): "Connect to Discord" for a
 * character (its editors) or a party board (its game master), which has
 * Discord create a webhook in the channel the user picks (D4); "Link my
 * Discord account" and "Sign in with Discord" (D5). Each returns the address
 * of Discord's authorization page, with a state the server keeps
 * (server/oauthStates.ts), bound to the browser by the hash of its nonce
 * (discordNonce.js); the redirect back is the server's
 * (server/oauthCallback.ts). Without the application's settings on the
 * server, they refuse, and the interface offers none of them
 * (Meteor.settings.public.discordOAuth).
 */

const rateLimit = { numRequests: 5, timeInterval: 10000 };

const targetSchema = {
  creatureId: { type: String, max: 32, optional: true },
  folderId: { type: String, max: 32, optional: true },
};
// The page to come back to, a path of the app; and the hash of the browser's
// nonce, which the way back must match
const returnToSchema = {
  returnTo: { type: String, max: 512, optional: true },
  nonceHash: { type: String, regEx: NONCE_HASH },
};

// The character or board, once its editor or game master is checked
async function getTarget({ creatureId, folderId }, userId) {
  if (!userId) throw boardError('discord.denied', 'discord.errors.denied');
  if (creatureId && !folderId) {
    const creature = await Creatures.findOneAsync(creatureId, {
      fields: { owner: 1, writers: 1, readers: 1, public: 1, type: 1 },
    });
    await assertEditPermission(creature, userId);
    // A monster's or a non-player character's log is its game master's alone
    if (creature?.type && GM_CREATURE_TYPES.includes(creature.type)) throw boardError('discord.denied', 'discord.errors.gmCreature');
    return { creatureId };
  }
  if (folderId && !creatureId) {
    // Imported when called: the folders' methods import these
    const { default: CreatureFolders } = await import('/imports/api/creature/creatureFolders/CreatureFolders');
    const folder = await CreatureFolders.findOneAsync(folderId, { fields: { owner: 1, members: 1 } });
    if (getPartyRole(folder, userId) !== 'gm') throw boardError('discord.denied', 'discord.errors.denied');
    return { folderId };
  }
  throw boardError('discord.denied', 'discord.errors.denied');
}

/**
 * The application's settings, and the state of a new authorization. On the
 * server alone: the client's bundle gets none of these modules
 * @param {{
 *   purpose: import('/imports/api/discord/server/oauthStates').OAuthPurpose,
 *   scope: import('/imports/api/discord/server/oauthClient').Scope,
 *   userId?: string, target?: import('/imports/api/discord/server/oauthStates').OAuthTarget, returnTo?: string,
 *   nonceHash: string, silent?: boolean,
 * }} authorization
 */
async function startAuthorization({ purpose, scope, userId, target, returnTo, nonceHash, silent }) {
  if (Meteor.isServer) {
    const { oauthConfig, authorizeUrl } = await import('/imports/api/discord/server/oauthClient');
    const { createState } = await import('/imports/api/discord/server/oauthStates');
    const config = oauthConfig();
    if (!config) throw boardError('discord.notConfigured', 'discord.errors.notConfigured');
    const state = await createState({ purpose, userId, target, returnTo, nonceHash, silent });
    return authorizeUrl(config, scope, state, { silent });
  }
}

/** Discord's page that creates a webhook in the channel the user picks, for a character or a board */
export const discordConnectUrl = new ValidatedMethod({
  name: 'discord.connectUrl',
  validate: new SimpleSchema({ ...targetSchema, ...returnToSchema }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ creatureId, folderId, returnTo, nonceHash }) {
    const target = await getTarget({ creatureId, folderId }, this.userId);
    if (Meteor.isServer) {
      return startAuthorization({
        purpose: 'connect', scope: 'webhook.incoming', userId: this.userId ?? undefined, target, returnTo, nonceHash,
      });
    }
  },
});

/** Disconnects a character or a board from its channel: the webhook goes once nothing uses it */
export const discordDisconnect = new ValidatedMethod({
  name: 'discord.disconnect',
  validate: new SimpleSchema(targetSchema).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ creatureId, folderId }) {
    const target = await getTarget({ creatureId, folderId }, this.userId);
    if (Meteor.isServer) {
      const { disconnectTarget } = await import('/imports/api/creature/log/server/connectedWebhooks');
      const { oauthConfig } = await import('/imports/api/discord/server/oauthClient');
      const { discordApiBase } = await import('/imports/api/creature/log/server/webhookSender');
      await disconnectTarget(oauthConfig()?.apiBase ?? discordApiBase(), target);
    }
  },
});

/** Discord's page that says who the user is there, to link their account */
export const discordLinkUrl = new ValidatedMethod({
  name: 'discord.linkUrl',
  validate: new SimpleSchema(returnToSchema).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ returnTo, nonceHash }) {
    if (!this.userId) throw boardError('discord.denied', 'discord.errors.denied');
    if (Meteor.isServer) {
      return startAuthorization({ purpose: 'link', scope: 'identify', userId: this.userId, returnTo: returnTo || '/account', nonceHash });
    }
  },
});

/**
 * Unlinks the user's Discord account. Their authorization of DiceCloud stays
 * on Discord, which DiceCloud holds no token to revoke: the interface tells
 * them where to remove it (Authorized Apps)
 */
export const discordUnlink = new ValidatedMethod({
  name: 'discord.unlink',
  validate: null,
  mixins: [RateLimiterMixin],
  rateLimit,
  async run() {
    if (!this.userId) throw boardError('discord.denied', 'discord.errors.denied');
    await Meteor.users.updateAsync(this.userId, { $unset: { discordAccount: 1 } });
    // The characters chosen with /character go with the link, and /action's
    // menus in progress and last targets
    if (Meteor.isServer) {
      const { forgetActiveCharacters } = await import('/imports/api/discord/server/interactions/interactionCharacters');
      await forgetActiveCharacters(this.userId);
      const { forgetActionSessions } = await import('/imports/api/discord/server/interactions/actionSessions');
      await forgetActionSessions(this.userId);
    }
  },
});

/**
 * Discord's page for "Sign in with Discord": signed out, for an account that
 * linked its Discord account. Never creates one. With prompt=none: one click
 * for a user who authorized DiceCloud when linking
 */
export const discordLoginUrl = new ValidatedMethod({
  name: 'discord.loginUrl',
  validate: new SimpleSchema(returnToSchema).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ returnTo, nonceHash }) {
    if (Meteor.isServer) {
      return startAuthorization({ purpose: 'login', scope: 'identify', returnTo, nonceHash, silent: true });
    }
  },
});

/** The slash commands registered with Discord (D6): when, their hash, whether they are the current ones */
export const discordCommandsStatus = new ValidatedMethod({
  name: 'discord.commandsStatus',
  validate: null,
  mixins: [RateLimiterMixin],
  rateLimit,
  async run() {
    await assertAdmin(this.userId);
    if (Meteor.isServer) {
      const { commandsStatus } = await import('/imports/api/discord/server/interactions/commandRegistration');
      return commandsStatus();
    }
  },
});

/** How many Discord servers and channels DiceCloud posts to: Discord verifies an app beyond 100 servers */
export const discordConnectedCounts = new ValidatedMethod({
  name: 'discord.connectedCounts',
  validate: null,
  mixins: [RateLimiterMixin],
  rateLimit,
  async run() {
    await assertAdmin(this.userId);
    if (Meteor.isServer) {
      const { connectedCounts } = await import('/imports/api/creature/log/server/connectedWebhooks');
      return connectedCounts();
    }
  },
});
