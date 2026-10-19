import { hidesStatsFromPlayers } from '/imports/api/creature/creatureFolders/boardMonsters';

/**
 * A character folder is a party: its owner is the game master, and the
 * players who joined through its invitation link are its members.
 */

// Optional fields: the folders collection isn't typed
export type PartyFolder = {
  _id?: string,
  owner?: string,
  members?: string[],
  creatures?: string[],
  archived?: boolean,
  // false: the game master does not let the players target their monsters
  playersTargetMonsters?: boolean,
};

// What the party's rule reads of a creature
type PartyCreature = { _id?: string, owner?: string, type?: string };

/** 'gm' for the folder's owner, 'member' for a player who joined, undefined otherwise */
export function getPartyRole(
  folder: PartyFolder | undefined | null, userId: string | undefined | null
): 'gm' | 'member' | undefined {
  if (!folder || !userId) return undefined;
  if (folder.owner === userId) return 'gm';
  if (folder.members?.includes(userId)) return 'member';
  return undefined;
}

/**
 * The Mongo filter of the folder's characters a party board shows its viewer.
 * The game master sees those they can view, as in their own folders. A member
 * sees the party's characters, those of the game master and of the members,
 * whoever they are shared with: joining shares a summary with the table. A
 * character of someone outside the party never shows to members, whatever
 * the game master puts in the folder.
 */
// The folder as stored: the schema requires its owner
export function partyCreaturesFilter(folder: PartyFolder & { owner: string }, userId: string) {
  const _id = { $in: folder.creatures || [] };
  if (getPartyRole(folder, userId) === 'gm') {
    return { _id, $or: [{ owner: userId }, { readers: userId }, { writers: userId }, { public: true }] };
  }
  return { _id, owner: { $in: [folder.owner, ...(folder.members || [])] } };
}

/**
 * Whether the party lets a user act with one of its creatures on another,
 * beyond what the user may edit (phases 2.2 and 2.3 of the monsters): during
 * play, whoever sits at the table — its game master or a member — may apply
 * an action or a spell of their character to the table's player characters
 * (healing, buffs, support spells), and to the game master's monsters and
 * non-player characters, unless the game master turned that off
 * (`playersTargetMonsters`). The folder is not archived and holds both; the
 * user sits at its table; the actor and the target belong to someone who
 * does. That the user may edit the actor, and that the task is one an action
 * applies (assertMayTarget), are checked apart. The server's rule
 * (assertMayTarget.ts), and what the target picker offers (targetCandidates)
 */
export function partyLetsTarget(
  folder: PartyFolder | undefined | null, userId: string | undefined | null,
  actor: PartyCreature | undefined | null, target: PartyCreature | undefined | null,
): boolean {
  return !!folder && partyTargetable(folder, userId, target) && isTablesCreature(folder, actor);
}

/**
 * The target's half of partyLetsTarget: whether the creature is one of the
 * party's that those at its table may target, with any character of the
 * table. A board's "Target" (PartyMemberCard), which no actor has chosen yet
 */
export function partyTargetable(
  folder: PartyFolder | undefined | null, userId: string | undefined | null, target: PartyCreature | undefined | null,
): boolean {
  if (!folder || folder.archived || !getPartyRole(folder, userId)) return false;
  if (!isTablesCreature(folder, target)) return false;
  if (target?.type === 'pc') return true;
  // The game master's monsters and non-player characters, whose stats the
  // players never read: the server tells them the results alone (phase 2.3)
  return hidesStatsFromPlayers(target, folder.owner) && playersTargetMonsters(folder);
}

/**
 * Whether the game master lets the players target their monsters and
 * non-player characters: unless they turned it off
 */
export const playersTargetMonsters = (folder: PartyFolder | undefined | null) => folder?.playersTargetMonsters !== false;

// In the folder, and belonging to its game master or one of its members
function isTablesCreature(folder: PartyFolder, creature: PartyCreature | undefined | null): boolean {
  if (!creature?._id || !creature.owner || !(folder.creatures || []).includes(creature._id)) return false;
  return [folder.owner, ...(folder.members || [])].includes(creature.owner);
}
