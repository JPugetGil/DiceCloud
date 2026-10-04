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
};

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
export function partyCreaturesFilter(folder: PartyFolder, userId: string) {
  const _id = { $in: folder.creatures || [] };
  if (getPartyRole(folder, userId) === 'gm') {
    return { _id, $or: [{ owner: userId }, { readers: userId }, { writers: userId }, { public: true }] };
  }
  return { _id, owner: { $in: [folder.owner, ...(folder.members || [])] } };
}
