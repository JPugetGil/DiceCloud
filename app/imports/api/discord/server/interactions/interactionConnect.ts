import type { Mongo } from 'meteor/mongo';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import { getPartyRole } from '/imports/api/creature/creatureFolders/party';
import { escapeMarkdown } from '/imports/api/creature/log/discord/partyMessages';
import type { DiscordLanguage } from '/imports/api/creature/log/discord/discordMessages';
import { connectTarget, liveChannelWebhook } from '/imports/api/creature/log/server/connectedWebhooks';
import { BOT_PERMISSIONS } from '/imports/api/discord/botPermissions';
import {
  botChannel, botToken, createChannelWebhook, hasPermission,
} from '/imports/api/discord/server/botClient';
import { editOriginal, interactionsApiBase } from '/imports/api/discord/server/interactions/interactionApi';
import type { LinkedUser } from '/imports/api/discord/server/interactions/interactionCharacters';
import { EPHEMERAL, RESPONSE, say, textMessage } from '/imports/api/discord/server/interactions/interactionReplies';
import type { Handled, Interaction } from '/imports/api/discord/server/interactions/interactionCommands';

/*
 * /connect (/connecter), phase D: connects the channel it is run in to a
 * party or a character, as "Connect to Discord" (D4) does, and connects a
 * forum, which Discord's picker never offers: run in one of its posts, it
 * connects the forum. The bot creates DiceCloud's webhook there (one per
 * channel: a live one is used again), which the application owns: its
 * messages may carry the buttons of D7, and a forum's sessions are posts.
 *
 * Only for a linked account (D5), in a server, by someone Discord lets
 * manage that channel's webhooks (`member.permissions`), where the bot may
 * manage them too (`app_permissions`), for a party they lead or a character
 * they may edit. The bot never acts in a channel where nobody proved that.
 */

const TEXT = 0;
const FORUM = 15;
const THREADS = [11, 12];

type FolderDoc = { _id: string, name?: string, owner?: string, members?: string[] };
type Target = { folderId: string, name: string } | { creatureId: string, name: string };

async function creatureFolders() {
  const { default: CreatureFolders } = await import('/imports/api/creature/creatureFolders/CreatureFolders');
  return CreatureFolders as unknown as Mongo.Collection<FolderDoc>;
}

/** What a user may connect: the parties they lead, the characters they may edit */
export async function connectTargets(user: LinkedUser): Promise<{ name: string, value: string }[]> {
  const CreatureFolders = await creatureFolders();
  const parties = await CreatureFolders.find({ owner: user._id }, {
    fields: { name: 1 }, sort: { name: 1 }, limit: 100,
  }).fetchAsync();
  const characters = await Creatures.find({ $or: [{ owner: user._id }, { writers: user._id }], type: 'pc' }, {
    fields: { name: 1 }, sort: { name: 1 }, limit: 100,
  }).fetchAsync();
  return [
    ...parties.map(party => ({ name: party.name?.trim() || '?', value: `folder:${party._id}` })),
    ...characters.map(creature => ({ name: creature.name?.trim() || '?', value: `creature:${creature._id}` })),
  ];
}

/** The target an option names, read again with its rights: a party its game master leads, a character they may edit */
async function resolveTarget(user: LinkedUser, value: string): Promise<Target | 'denied' | undefined> {
  if (!/^(folder|creature):\w{1,32}$/.test(value)) {
    // Typed rather than chosen: by its name, among the user's own
    const typed = value.trim().toLowerCase();
    const named = (await connectTargets(user)).filter(target => target.name.toLowerCase() === typed);
    if (named.length !== 1) return undefined;
    value = named[0].value;
  }
  const match = /^folder:(\w{1,32})$/.exec(value);
  if (match) {
    const folder = await (await creatureFolders()).findOneAsync(match[1], { fields: { name: 1, owner: 1, members: 1 } });
    if (!folder) return undefined;
    return getPartyRole(folder, user._id) === 'gm' ? { folderId: folder._id, name: folder.name?.trim() || '?' } : 'denied';
  }
  const creatureMatch = /^creature:(\w{1,32})$/.exec(value);
  if (!creatureMatch) return undefined;
  const creature = await Creatures.findOneAsync(creatureMatch[1], { fields: { name: 1, owner: 1, writers: 1 } });
  if (!creature) return undefined;
  return hasEditPermission(creature as any, user) ? { creatureId: creature._id, name: creature.name?.trim() || '?' } : 'denied';
}

const reply = (language: DiscordLanguage, key: string, params: Record<string, string | number> = {}): Handled => ({
  response: { type: RESPONSE.message, data: textMessage(say(language, key, params)) },
});

/** /connect: its checks, then the bot's webhook in the channel (or the post's forum), for its user alone */
export async function connectCommand(interaction: Interaction & { app_permissions?: string }, { user, language }: {
  user: LinkedUser, language: DiscordLanguage,
}): Promise<Handled> {
  if (!interaction.guild_id) return reply(language, 'connectServerOnly');
  if (!botToken()) return reply(language, 'connectNoBot');
  const manage = BOT_PERMISSIONS.MANAGE_WEBHOOKS;
  if (!hasPermission((interaction.member as { permissions?: string } | undefined)?.permissions, manage)) return reply(language, 'connectMemberRight');
  if (!hasPermission(interaction.app_permissions, manage)) return reply(language, 'connectBotRight');
  const option = interaction.data?.options?.find(item => item.name === 'target')?.value;
  const target = typeof option === 'string' ? await resolveTarget(user, option) : undefined;
  if (target === 'denied') return reply(language, 'connectTargetDenied');
  if (!target) return reply(language, 'connectTargetNotFound', { name: escapeMarkdown(String(option ?? '')) });
  const channel = interaction.channel as { id?: string, type?: number, parent_id?: string } | undefined;
  const here = interaction.channel_id ?? channel?.id;
  const inThread = THREADS.includes(Number(channel?.type));
  if (!here || (!inThread && channel?.type !== TEXT)) return reply(language, 'connectWhere');

  return {
    response: { type: RESPONSE.deferredMessage, data: { flags: EPHEMERAL } },
    after: async () => {
      let message: Record<string, unknown>;
      try {
        message = await connectHere({ user, language, target, here, parentId: inThread ? channel?.parent_id : undefined });
      } catch (e) {
        console.warn(`Discord: /connect failed: ${(e as Error)?.message || e}`);
        message = textMessage(say(language, 'connectFailed', { status: '–' }));
      }
      // For its user alone, as the deferral said
      delete (message as { flags?: number }).flags;
      await editOriginal({ applicationId: interaction.application_id, token: interaction.token }, message);
    },
  };
}

async function connectHere({ user, language, target, here, parentId }: {
  user: LinkedUser, language: DiscordLanguage, target: Target, here: string, parentId?: string,
}) {
  // In a thread: its channel, a forum for a forum's post. Discord says which
  let channelId = here;
  let kind: 'text' | 'forum' = 'text';
  if (parentId) {
    const parent = await botChannel(parentId);
    if (!parent.ok) return textMessage(say(language, 'connectFailed', { status: parent.status ?? '–' }));
    if (parent.value.type !== TEXT && parent.value.type !== FORUM) return textMessage(say(language, 'connectWhere'));
    channelId = parentId;
    kind = parent.value.type === FORUM ? 'forum' : 'text';
  }
  const apiBase = interactionsApiBase();
  if (!apiBase) return textMessage(say(language, 'connectFailed', { status: '–' }));
  // One DiceCloud webhook per channel: a live one is used again
  let webhook = await liveChannelWebhook(apiBase, channelId);
  if (!webhook) {
    const created = await createChannelWebhook(channelId);
    if (!created.ok) {
      return textMessage(say(language, 'connectFailed', { status: `${created.status ?? '–'}${created.code ? ` ${created.code}` : ''}` }));
    }
    webhook = created.value;
  }
  await connectTarget({
    apiBase, userId: user._id, webhook, kind,
    target: 'folderId' in target ? { folderId: target.folderId } : { creatureId: target.creatureId },
  });
  return textMessage(say(language, kind === 'forum' ? 'connectedForum' : 'connectedChannel', { name: escapeMarkdown(target.name) }));
}
