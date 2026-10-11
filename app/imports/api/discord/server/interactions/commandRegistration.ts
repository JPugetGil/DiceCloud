import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { oauthConfig, overwriteGlobalCommands } from '/imports/api/discord/server/oauthClient';
import { DISCORD_API } from '/imports/api/creature/log/server/webhookSender';
import { COMMANDS, commandsHash } from '/imports/api/discord/server/interactions/commandDefinitions';
import { interactionsPublicKey } from '/imports/api/discord/server/interactions/interactionSignature';

/*
 * Registering the slash commands with Discord (D6): all of them at once,
 * replacing the application's global commands (PUT /applications/<id>/
 * commands), with a client credentials token for the application itself,
 * scope `applications.commands.update`: no bot token. At startup, and only
 * when the definitions changed since the last registration for this
 * application (their hash, kept here).
 *
 * Where: in production, with the application's settings and its public key.
 * In development, never to Discord itself unless the settings say
 * `discord.registerCommands: true` (a development application); to the local
 * fake (DISCORD_WEBHOOK_TEST_API), always. Under tests, only when a test asks.
 */

type Registration = { _id: string, hash: string, registeredAt: Date, count: number };

export const DiscordCommandRegistrations = new Mongo.Collection<Registration>('discordCommandRegistrations');

/** Whether this server may register commands where its requests go */
export function mayRegisterCommands(): boolean {
  const config = oauthConfig();
  if (!config || !interactionsPublicKey()) return false;
  if (Meteor.isProduction) return true;
  if (config.apiBase !== DISCORD_API) return true;
  return (Meteor.settings as { discord?: { registerCommands?: unknown } }).discord?.registerCommands === true;
}

export type RegistrationResult = { status: 'registered' | 'unchanged' | 'skipped', count?: number, hash: string };

/** Registers the commands if their definitions changed (or `force`) */
export async function registerCommands({ force = false } = {}): Promise<RegistrationResult> {
  const hash = commandsHash();
  const config = oauthConfig();
  if (!config || !interactionsPublicKey()) return { status: 'skipped', hash };
  const last = await DiscordCommandRegistrations.findOneAsync(config.clientId);
  if (!force && last?.hash === hash) return { status: 'unchanged', hash, count: last.count };
  const count = await overwriteGlobalCommands(config, COMMANDS);
  await DiscordCommandRegistrations.upsertAsync(config.clientId, { $set: { hash, registeredAt: new Date(), count } });
  return { status: 'registered', hash, count };
}

/** What the administration page shows: the commands registered, when, and whether they are the current ones */
export async function commandsStatus() {
  const config = oauthConfig();
  const hash = commandsHash();
  const last = config ? await DiscordCommandRegistrations.findOneAsync(config.clientId) : undefined;
  return {
    interactions: !!interactionsPublicKey(),
    hash,
    ...last && { registeredAt: last.registeredAt, registeredHash: last.hash, count: last.count },
    upToDate: last?.hash === hash,
  };
}

// In development only, against a local fake of Discord: registers the
// commands again now, for the browser checks (tests/e2e, check
// discord-interactions), which start their fake after the server. Never to
// Discord itself; a production server has no such method
if (Meteor.isDevelopment) {
  Meteor.methods({
    async 'discord.testRegisterCommands'() {
      const config = oauthConfig();
      if (!this.userId || !config || config.apiBase === DISCORD_API) return null;
      return registerCommands({ force: true });
    },
  });
}

if (!Meteor.isTest && !Meteor.isAppTest) {
  Meteor.startup(() => {
    if (!oauthConfig() || !interactionsPublicKey()) return;
    if (!mayRegisterCommands()) {
      console.log('Discord: commands not registered in development (discord.registerCommands is not true)');
      return;
    }
    registerCommands().then(({ status, count, hash }) => {
      if (status === 'registered') console.log(`Discord: ${count} commands registered (${hash.slice(0, 12)})`);
    }).catch(e => console.warn(`Discord: the commands were not registered: ${(e as Error).message}`));
  });
}
