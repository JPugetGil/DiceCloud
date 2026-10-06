import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import initiativeOrder from '/imports/api/creature/creatureFolders/initiativeOrder';

/**
 * Takes characters out of a folder: out of its creatures and its initiative
 * tracker, and no longer editable or readable by the folder's owner, who had
 * that access as the party's game master
 */
export async function removeCharacters(folder, creatureIds) {
  if (!creatureIds.length) return;
  const update = { $pullAll: { creatures: creatureIds } };
  const tracker = folder.initiative;
  if (tracker?.entries?.length) {
    // The turn stays with the creature whose turn it is, or the next one
    const order = initiativeOrder(tracker.entries);
    const kept = order.filter(entry => !creatureIds.includes(entry.creatureId));
    const current = order.slice(tracker.turn || 0).find(entry => kept.includes(entry));
    const turn = current ? kept.indexOf(current) : 0;
    update.$set = {
      'initiative.entries': tracker.entries.filter(entry => !creatureIds.includes(entry.creatureId)),
      'initiative.turn': turn,
    };
  }
  await CreatureFolders.updateAsync(folder._id, update);
  await Creatures.updateAsync(
    { _id: { $in: creatureIds } },
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
