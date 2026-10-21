import { Meteor } from 'meteor/meteor';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';

/**
 * Takes characters out of a folder: out of its creatures and its initiative
 * tracker, and no longer editable or readable by the folder's owner, who had
 * that access as the party's game master. If one of them had the turn, the
 * next creature's turn starts (removeFromTracker). Server only
 */
export async function removeCharacters(folder, creatureIds) {
  if (!creatureIds.length) return;
  // Off the board first: the turn that starts no longer counts their effects
  await CreatureFolders.updateAsync(folder._id, { $pullAll: { creatures: creatureIds } });
  // The server's alone: require(), read when called, inside the check, which
  // the client's build drops with the module (it would bring the server's
  // secrets: the dice's HMAC, the webhooks' cipher)
  if (Meteor.isServer) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { removeFromTracker } = require('/imports/api/creature/creatureFolders/server/turnEvents');
    await removeFromTracker(folder._id, { creatureIds });
  }
  await revokeOwnerAccess(folder, creatureIds);
}

/**
 * The folder's owner no longer edits nor reads the characters, which they did
 * as the party's game master, but those another of their parties still holds:
 * a character in two of their parties stays theirs to run in the other. A
 * folder without players grants nothing. Their own creatures are theirs
 * anyway. Call it once the characters are out of the folder, or the folder
 * gone. Server only
 */
export async function revokeOwnerAccess(folder, creatureIds) {
  if (!folder?.owner || !creatureIds.length) return;
  const stillHeld = new Set((await CreatureFolders.find({
    owner: folder.owner, _id: { $ne: folder._id }, creatures: { $in: creatureIds }, 'members.0': { $exists: true },
  }, { fields: { creatures: 1 } }).fetchAsync()).flatMap(other => other.creatures || []));
  const released = creatureIds.filter(id => !stillHeld.has(id));
  if (!released.length) return;
  await Creatures.updateAsync(
    { _id: { $in: released } },
    { $pull: { writers: folder.owner, readers: folder.owner } },
    { multi: true },
  );
}

/**
 * Takes characters out of every folder that holds them or lists them in its
 * initiative tracker, whoever owns it: a deleted character must not stay, by
 * id and name, on another game master's party board
 */
export async function removeFromAllFolders(creatureIds) {
  if (!creatureIds.length) return;
  const folders = await CreatureFolders.find({
    $or: [
      { creatures: { $in: creatureIds } },
      { 'initiative.entries.creatureId': { $in: creatureIds } },
    ],
  }).fetchAsync();
  for (const folder of folders) {
    const held = creatureIds.filter(id => folder.creatures?.includes(id)
      || folder.initiative?.entries?.some(entry => entry.creatureId === id));
    await removeCharacters(folder, held);
  }
}
