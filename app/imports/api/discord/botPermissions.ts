/*
 * The permissions DiceCloud's bot asks for when a server's administrator adds
 * it (phase D): view the channels, manage webhooks, create public threads,
 * send messages in threads. Shared by the server, which checks them
 * (botClient.ts), and the client, whose installation link asks for them
 * (discordInstall.js): the link carried a copy of their sum, written by hand.
 */

// https://docs.discord.com/developers/topics/permissions
export const BOT_PERMISSIONS = {
  VIEW_CHANNEL: BigInt(1) << BigInt(10),
  MANAGE_WEBHOOKS: BigInt(1) << BigInt(29),
  CREATE_PUBLIC_THREADS: BigInt(1) << BigInt(35),
  SEND_MESSAGES_IN_THREADS: BigInt(1) << BigInt(38),
};

/** The permissions the bot asks for when added to a server: 309774517248 */
export const BOT_PERMISSION_INTEGER = Object.values(BOT_PERMISSIONS).reduce((sum, bit) => sum | bit, BigInt(0));
