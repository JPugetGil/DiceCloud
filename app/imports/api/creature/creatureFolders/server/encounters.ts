import { Random } from 'meteor/random';
import CreatureFoldersCollection from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';

// Untyped: the folders' schema is JavaScript
const CreatureFolders = CreatureFoldersCollection as any;

/*
 * The encounter of a party (phase 2.4 of the monsters): what a creature of the
 * party received from another during it can be undone until the game master
 * ends it, with "End the encounter" or "End the combat" (Q5 of
 * tools/party-monsters/SPEC-phases-2-3.md).
 *
 * - A party, a folder that is not archived, is in an encounter while a fight
 *   runs in its initiative tracker (round 1 or more), or while its board
 *   holds monsters of its game master, fight or not: those "End the
 *   encounter" deletes (removeBoardMonsters). Not its non-player
 *   characters, which stay from one encounter to the next.
 * - An encounter has an id, the folder's `encounterId`. The server names it
 *   the first time a creature of the party acts on another during it
 *   (encounterFinder). The game master's "End the combat" (endInitiative)
 *   and "End the encounter" (endEncounter, whether or not it ends the combat
 *   too) forget it; the next encounter gets another.
 * - A received entry written during an encounter keeps it
 *   (`received.encounter`: the folder and the id), and can be undone while
 *   the folder, still holding its creature and not archived, has that id
 *   (isCurrentEncounter).
 * - An entry written outside any encounter, a heal in town between two
 *   fights, keeps none, and can never be undone. An encounter that ended
 *   otherwise than through the buttons (its monsters deleted from their own
 *   sheets, with no fight) is forgotten as soon as a creature of the party
 *   acts on another outside any encounter, or when the next one ends.
 */

export type Encounter = { folderId: string, id: string };

type Folder = { _id: string, owner?: string, creatures?: string[], initiative?: { round?: number }, encounterId?: string };

// Whether the party is in an encounter: a fight under way, or the game
// master's monsters on its board
async function inEncounter(folder: Folder): Promise<boolean> {
  if ((folder.initiative?.round || 0) > 0) return true;
  return !!await Creatures.findOneAsync({
    _id: { $in: folder.creatures || [] }, owner: folder.owner, type: 'monster',
  } as any, { fields: { _id: 1 } });
}

// The encounter's id, named once: two actions at once agree on it
async function encounterId(folder: Folder): Promise<string | undefined> {
  if (folder.encounterId) return folder.encounterId;
  await CreatureFolders.updateAsync(
    { _id: folder._id, encounterId: { $exists: false } }, { $set: { encounterId: Random.id() } },
  );
  return (await CreatureFolders.findOneAsync(folder._id, { fields: { encounterId: 1 } }))?.encounterId;
}

/**
 * The encounter an action of `actorId` happens in, with each creature it
 * acted on: that of the first party, by folder id, that holds both and is in
 * an encounter; none outside any. Reads the actor's parties once, for all
 * the creatures of the action. A party that is in no encounter but still has
 * an id (its monsters deleted from their sheets) forgets it
 */
export async function encounterFinder(actorId: string): Promise<(targetId: string) => Promise<Encounter | undefined>> {
  const folders: Folder[] = await CreatureFolders.find(
    { creatures: actorId, archived: { $ne: true } },
    { fields: { owner: 1, creatures: 1, 'initiative.round': 1, encounterId: 1 }, sort: { _id: 1 } },
  ).fetchAsync();
  const ongoing = new Map<string, Promise<string | undefined>>();
  for (const folder of folders) {
    if (await inEncounter(folder)) {
      ongoing.set(folder._id, encounterId(folder));
    } else if (folder.encounterId) {
      await CreatureFolders.updateAsync(
        { _id: folder._id, encounterId: folder.encounterId }, { $unset: { encounterId: 1 } },
      );
    }
  }
  return async (targetId: string) => {
    for (const folder of folders) {
      if (!ongoing.has(folder._id) || !folder.creatures?.includes(targetId)) continue;
      const id = await ongoing.get(folder._id);
      if (id) return { folderId: folder._id, id };
    }
    return undefined;
  };
}

/**
 * Whether the encounter an entry kept is still under way: its party, not
 * archived, still holds the creature, and has not ended it since
 */
export async function isCurrentEncounter(encounter: Partial<Encounter> | undefined, creatureId: string): Promise<boolean> {
  if (!encounter?.folderId || !encounter.id) return false;
  return !!await CreatureFolders.findOneAsync({
    _id: encounter.folderId, encounterId: encounter.id, creatures: creatureId, archived: { $ne: true },
  }, { fields: { _id: 1 } });
}
