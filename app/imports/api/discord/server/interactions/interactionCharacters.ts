import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import { GM_CREATURE_TYPES } from '/imports/api/creature/creatureFolders/boardMonsters';

/*
 * Who runs a command (D6) and with which character. A Discord user is the
 * DiceCloud account that linked their Discord account (D5); nobody else.
 * Their characters are those they may edit; the game master's monsters and
 * non-player characters too, in their party's channel. Without the
 * `character` option, the character they chose with /character for this
 * server (one per server, one outside servers), else, in a party's channel,
 * their only character in the party; else they are asked to choose.
 */

export type LinkedUser = { _id: string, roles?: string[] };

export type CommandCreature = {
  _id: string,
  name?: string,
  type?: string,
  owner?: string,
  writers?: string[],
  readers?: string[],
  public?: boolean,
  color?: string,
  picture?: string,
  avatarPicture?: string,
};

const CREATURE_FIELDS = {
  name: 1, type: 1, owner: 1, writers: 1, readers: 1, public: 1, color: 1, picture: 1, avatarPicture: 1,
} as const;

/** The DiceCloud account a Discord user linked, if any */
export async function linkedUser(discordUserId: string | undefined): Promise<LinkedUser | undefined> {
  if (!discordUserId || !/^\d{1,32}$/.test(discordUserId)) return undefined;
  return await Meteor.users.findOneAsync({ 'discordAccount.id': discordUserId }, { fields: { roles: 1 } }) as LinkedUser | undefined;
}

/** Whether the user may run commands with the creature: they may edit it */
export function mayUse(creature: CommandCreature | undefined, user: LinkedUser): boolean {
  return !!creature && hasEditPermission(creature as any, user);
}

/** A monster or a non-player character: its game master's, whose stats nothing public shows */
export const isGameMasters = (creature?: { type?: string }) => GM_CREATURE_TYPES.includes(creature?.type as any);

/** A creature, as commands read it */
export async function commandCreature(creatureId: unknown): Promise<CommandCreature | undefined> {
  if (typeof creatureId !== 'string' || !/^\w{1,32}$/.test(creatureId)) return undefined;
  return await Creatures.findOneAsync(creatureId, { fields: CREATURE_FIELDS }) as CommandCreature | undefined;
}

// ---------------------------------------------------------------- the party of a channel

type PartyFolder = { _id: string, name?: string, owner?: string, members?: string[], creatures?: string[] };

/**
 * The party whose Discord channel this is: connected (D4), pasted (once
 * Discord said where it posts), or a post of its session. Among the user's
 * parties only, as game master or player
 */
export async function partyOfChannel(channelIds: (string | undefined)[], userId: string): Promise<PartyFolder | undefined> {
  const ids = channelIds.filter((id): id is string => typeof id === 'string' && /^\d{1,32}$/.test(id));
  if (!ids.length) return undefined;
  const { default: CreatureFolders } = await import('/imports/api/creature/creatureFolders/CreatureFolders');
  return await (CreatureFolders as unknown as Mongo.Collection<PartyFolder>).findOneAsync({
    $and: [
      { $or: [{ owner: userId }, { members: userId }] },
      {
        $or: [
          { 'discord.channel.channelId': { $in: ids } },
          { 'discord.webhookChannelId': { $in: ids } },
          { 'discord.session.threadId': { $in: ids } },
        ],
      },
    ],
  }, { fields: { name: 1, owner: 1, members: 1, creatures: 1 } });
}

// ---------------------------------------------------------------- candidates

/**
 * The characters the user may run commands with here: theirs and those they
 * may edit; in their party's channel, as its game master, the party's
 * monsters and non-player characters too
 */
export async function candidates(user: LinkedUser, party?: PartyFolder): Promise<CommandCreature[]> {
  const own = await Creatures.find(
    { $or: [{ owner: user._id }, { writers: user._id }], type: 'pc' },
    { fields: CREATURE_FIELDS, sort: { name: 1 }, limit: 200 },
  ).fetchAsync() as CommandCreature[];
  if (!party || party.owner !== user._id || !party.creatures?.length) return own;
  const monsters = await Creatures.find(
    { _id: { $in: party.creatures }, type: { $in: [...GM_CREATURE_TYPES] } },
    { fields: CREATURE_FIELDS, sort: { name: 1 }, limit: 100 },
  ).fetchAsync() as CommandCreature[];
  return [...own, ...monsters.filter(monster => mayUse(monster, user))];
}

/** "Fighter 3, Rogue 2": what tells two characters of the same name apart */
async function classesOf(creatureId: string): Promise<string> {
  const classes = await CreatureProperties.find({
    'root.id': creatureId, type: 'class', removed: { $ne: true }, inactive: { $ne: true },
  }, { fields: { name: 1, level: 1 }, sort: { left: 1 } }).fetchAsync() as { name?: string, level?: number }[];
  return classes.filter(cls => cls.name).map(cls => `${cls.name}${cls.level ? ` ${cls.level}` : ''}`).join(', ');
}

/** The choices an autocomplete offers: the name, and the classes of those that share it */
export async function characterChoices(list: CommandCreature[], typed: string) {
  const query = typed.trim().toLowerCase();
  const matching = list.filter(creature => !query || (creature.name || '').toLowerCase().includes(query)).slice(0, 25);
  return Promise.all(matching.map(async creature => {
    const name = creature.name?.trim() || '?';
    const twins = list.filter(other => (other.name?.trim() || '?') === name).length > 1;
    const classes = twins ? await classesOf(creature._id) : '';
    return { name: `${name}${classes ? ` — ${classes}` : ''}`.slice(0, 100), value: creature._id };
  }));
}

export type Resolution =
  | { creature: CommandCreature }
  | { problem: 'none' | 'notFound' | 'ambiguous', name?: string };

/** The character an option names: by the id the autocomplete gave, else by its name */
export function namedCharacter(list: CommandCreature[], value: string): Resolution {
  const byId = list.find(creature => creature._id === value);
  if (byId) return { creature: byId };
  const name = value.trim().toLowerCase();
  const named = list.filter(creature => (creature.name || '').trim().toLowerCase() === name);
  if (named.length === 1) return { creature: named[0] };
  return { problem: named.length ? 'ambiguous' : 'notFound', name: value.trim() };
}

// ---------------------------------------------------------------- the character chosen per server

type ActiveCharacter = { _id: string, userId: string, discordUserId: string, creatureId: string, updatedAt: Date };

/** The characters chosen with /character, per Discord user and server. Server only */
export const DiscordActiveCharacters = new Mongo.Collection<ActiveCharacter>('discordActiveCharacters');

// One per server; one outside servers (DMs, private channels)
const activeKey = (discordUserId: string, guildId?: string) => `${discordUserId}:${guildId || 'dm'}`;

export async function setActiveCharacter(discordUserId: string, guildId: string | undefined, userId: string, creatureId: string) {
  await DiscordActiveCharacters.upsertAsync(activeKey(discordUserId, guildId), {
    $set: { userId, discordUserId, creatureId, updatedAt: new Date() },
  });
}

export async function activeCharacterId(discordUserId: string, guildId: string | undefined, userId: string) {
  const active = await DiscordActiveCharacters.findOneAsync(activeKey(discordUserId, guildId));
  // Chosen by this account: a Discord account linked to another since chose nothing
  return active?.userId === userId ? active.creatureId : undefined;
}

/** Forgets the characters a user chose, when they unlink their Discord account */
export async function forgetActiveCharacters(userId: string) {
  await DiscordActiveCharacters.removeAsync({ userId });
}

/**
 * The character a command runs with: the option's, else the one chosen for
 * this server, else the user's only character in this channel's party
 */
export async function commandCharacter({ user, discordUserId, guildId, party, option }: {
  user: LinkedUser, discordUserId: string, guildId?: string, party?: PartyFolder, option?: string,
}): Promise<Resolution> {
  const list = await candidates(user, party);
  if (option?.trim()) return namedCharacter(list, option);
  const activeId = await activeCharacterId(discordUserId, guildId, user._id);
  const active = activeId && list.find(creature => creature._id === activeId);
  if (active) return { creature: active };
  if (party) {
    const mine = list.filter(creature => party.creatures?.includes(creature._id) && creature.owner === user._id && creature.type === 'pc');
    if (mine.length === 1) return { creature: mine[0] };
  }
  return { problem: 'none' };
}
