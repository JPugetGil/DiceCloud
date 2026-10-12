import { Meteor } from 'meteor/meteor';

/*
 * Discord's installation links of DiceCloud's application (D6, phase D):
 * on a server, the bot and its four permissions (view the channels, manage
 * webhooks, create public threads, send messages in threads: 309774517248);
 * on an account, the commands alone. Undefined without an application.
 */

export const BOT_PERMISSION_INTEGER = '309774517248';

const applicationId = () => Meteor.settings.public?.discordApplicationId;

/** Discord's own link, which asks where: an account or a server */
export function installUrl() {
  const id = applicationId();
  return id ? `https://discord.com/oauth2/authorize?client_id=${id}` : undefined;
}

/** The bot on a server, with its permissions; that server chosen already when known */
export function serverInstallUrl(guildId) {
  const id = applicationId();
  if (!id) return undefined;
  const guild = guildId && /^\d{1,32}$/.test(guildId) ? `&guild_id=${guildId}&disable_guild_select=true` : '';
  return `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot+applications.commands`
    + `&permissions=${BOT_PERMISSION_INTEGER}&integration_type=0${guild}`;
}

/** The commands on the user's account */
export function accountInstallUrl() {
  const id = applicationId();
  return id ? `https://discord.com/oauth2/authorize?client_id=${id}&scope=applications.commands&integration_type=1` : undefined;
}
