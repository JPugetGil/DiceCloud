import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import getPropertyTitle from '/imports/api/utility/getPropertyTitle';
import {
  changedPropIds, damagedPropIds, revertOf, type ChangedProp, type RevertOp,
} from '/imports/api/creature/log/receivedRevert';
import { encounterFinder, type Encounter } from '/imports/api/creature/creatureFolders/server/encounters';
import type { EngineAction } from '/imports/api/engine/action/EngineActions';

/** What a received entry keeps to be undone (CreatureLogs' `received`) */
export type ReceivedUndo = {
  revert?: RevertOp[],
  reversible?: true,
  irreversible?: string[],
  encounter?: Encounter,
};

/** The damage of attributes, as stored, by id */
export type StoredDamage = Map<string, number>;

/**
 * The damage of the attributes the action changes on other creatures than
 * its actor, as stored before it is written: what it did to each is the
 * difference once its creatures are computed (receivedUndoFinder). Server
 * only
 */
export async function damageBefore(action: EngineAction): Promise<StoredDamage> {
  const ids = damagedPropIds(action.results.flatMap(result => result.mutations)
    .filter(mutation => mutation.targetIds.some(id => id !== action.creatureId)));
  const damage: StoredDamage = new Map();
  if (!ids.length) return damage;
  const props = await CreatureProperties.find({ _id: { $in: ids } }, { fields: { damage: 1 } }).fetchAsync();
  for (const prop of props) damage.set(prop._id, (prop as { damage?: number }).damage || 0);
  return damage;
}

/**
 * What undoes the action's changes to each creature it acted on, for its
 * received entry (writeActionResults), once the action is written and its
 * creatures computed: whose each property it changed is, and the damage it
 * left, read once for all of them; the encounter each one is in, read when
 * one has something to undo. `removed`: the properties the action did
 * soft-remove; `before`: the damage of its attributes before it
 * (damageBefore). Server only
 */
export default async function receivedUndoFinder(
  action: EngineAction, removed: string[], before: StoredDamage,
): Promise<(targetId: string) => Promise<ReceivedUndo>> {
  const mutations = action.results.flatMap(result => result.mutations);
  const ids = changedPropIds(mutations);
  const changed = new Map<string, ChangedProp>();
  // What the action did to each attribute's damage, as stored
  const done = new Map<string, number>();
  if (ids.length) {
    const props = await CreatureProperties.find(
      { _id: { $in: ids } }, { fields: { root: 1, name: 1, type: 1, damage: 1 } },
    ).fetchAsync();
    for (const prop of props) {
      changed.set(prop._id, { rootId: prop.root?.id, title: getPropertyTitle(prop) });
      if (before.has(prop._id)) done.set(prop._id, ((prop as { damage?: number }).damage || 0) - before.get(prop._id)!);
    }
  }
  const removedIds = new Set(removed);
  let findEncounter: ReturnType<typeof encounterFinder> | undefined;
  return async (targetId: string) => {
    const { revert, irreversible } = revertOf(targetId, mutations, changed, removedIds, done);
    if (!revert.length && !irreversible.length) return {};
    findEncounter ??= encounterFinder(action.creatureId);
    const encounter = await (await findEncounter)(targetId);
    return {
      ...revert.length && { revert, reversible: true as const },
      ...irreversible.length && { irreversible },
      ...encounter && { encounter },
    };
  };
}
