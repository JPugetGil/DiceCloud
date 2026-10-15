import type { Mutation } from '/imports/api/engine/action/tasks/TaskResult';

/*
 * What undoes what another creature's action did to a creature (phase 2.4 of
 * the monsters): its player's answer to a monster's attack that applied by
 * itself, Shield, Lucky, a resistance forgotten (Q4 of
 * tools/party-monsters/SPEC-phases-2-3.md). The server works it out as it
 * writes the creature's received entry (writeActionResults), from the
 * action's changes to that creature's properties alone, and keeps it on the
 * entry, `received.revert`, which no publication sends and no archive holds.
 * Undoing it (revertReceived) applies each operation:
 * - `remove`: a property the action put on the creature, a buff, is removed
 *   as the sheet's trash removes it, with everything under it;
 * - `restore`: a buff the action removed comes back, with what went with it;
 * - `inc`: the damage the action added to an attribute (negative: what it
 *   healed) is taken off again, by the creature itself through damageProp,
 *   so that its limits hold and its own damage triggers fire. Damage that
 *   temporary hit points absorbed is given back to them, the rest to the hit
 *   points, as each bar took it; what a creature that dropped to 0 had left
 *   is what comes back, not the damage rolled. The amount is the damage as
 *   stored, before the action and once its creature is computed (the
 *   computation bounds it by the attribute's total), not the engine's
 *   increment: the engine reads a cache that can be a write behind, and its
 *   increment may then be more than the attribute had left.
 * A value the action set (an adjustment's `set`) cannot be undone: what it
 * was before is not known for sure once anything else changed it. The entry
 * names those attributes (`received.irreversible`).
 */

export type RevertOp =
  | { op: 'remove', propId: string }
  | { op: 'restore', propId: string }
  | { op: 'inc', propId: string, amount: number };

/** The most operations an entry keeps: an action applies at most 100 properties (applyTask) */
export const MAX_REVERT_OPS = 100;

/** The most attributes set that an entry names */
export const MAX_IRREVERSIBLE = 32;

/** What the server knows of a property the action changed: whose it is, and its title */
export type ChangedProp = { rootId?: string, title: string };

// An attribute's damage changed by damageProp: `damage` up, `value` down as much
const isDamage = (inc: Record<string, unknown> | undefined): inc is { damage: number, value: number } => !!inc
  && Object.keys(inc).length === 2 && typeof inc.damage === 'number' && inc.value === -inc.damage;

/** The damage an attribute was given by an update, if that is all it did */
export const damageOfUpdate = (update: { set?: unknown, inc?: Record<string, unknown> }): number | undefined =>
  !update.set && isDamage(update.inc) ? update.inc.damage : undefined;

export type Revert = { revert: RevertOp[], irreversible: string[] };

/**
 * What undoes the action's changes to one creature, `targetId`, from its
 * mutations in the order they were applied. Only that creature's own
 * properties count, whichever targets a mutation names: an action removes
 * its actor's own buff (targetParentBuff) under its targets' names.
 * - `changed`: the properties updated or removed, as written: whose they are;
 * - `removed`: those the action did soft-remove (a buff already gone is not
 *   restored by an undo);
 * - `done`: what the action did to the damage of the attributes, as stored
 *   (receivedUndo.ts), which replaces the increments of an attribute it
 *   did not set too: a value set stays, and its change is not undone.
 * The undo removes what was put on first, then restores what was removed,
 * then gives the attributes back: a buff's change to a maximum is in place
 * before the damage is taken off again.
 */
export function revertOf(
  targetId: string, mutations: Mutation[], changed: Map<string, ChangedProp>, removed: Set<string>,
  done: Map<string, number> = new Map(),
): Revert {
  const removes: string[] = [];
  const restores: string[] = [];
  const damage = new Map<string, number>();
  const set = new Set<string>();
  const irreversible: string[] = [];
  const own = (propId: string) => changed.get(propId)?.rootId === targetId;
  for (const mutation of mutations) {
    for (const update of mutation.updates || []) {
      if (!own(update.propId)) continue;
      const added = damageOfUpdate(update);
      if (added !== undefined) {
        damage.set(update.propId, (damage.get(update.propId) || 0) + added);
      } else if (update.set || update.inc) {
        set.add(update.propId);
        const title = changed.get(update.propId)!.title;
        if (!irreversible.includes(title)) irreversible.push(title);
      }
    }
    const inserted = (mutation.inserts || []).filter(doc => doc.root?.id === targetId);
    const insertedIds = new Set(inserted.map(doc => doc._id));
    for (const doc of inserted) {
      // The top of what was copied: a buff, which takes its children with it
      if (!doc.parentId || !insertedIds.has(doc.parentId)) removes.push(doc._id);
    }
    for (const { propId } of mutation.removals || []) {
      if (own(propId) && removed.has(propId) && !restores.includes(propId)) restores.push(propId);
    }
  }
  const revert: RevertOp[] = [
    ...removes.map(propId => ({ op: 'remove' as const, propId })),
    ...restores.map(propId => ({ op: 'restore' as const, propId })),
    ...[...damage].map(([propId, amount]) => [propId, done.has(propId) && !set.has(propId) ? done.get(propId)! : amount] as const)
      .filter(([, amount]) => amount).map(([propId, amount]) => ({ op: 'inc' as const, propId, amount })),
  ];
  return { revert: revert.slice(0, MAX_REVERT_OPS), irreversible: irreversible.slice(0, MAX_IRREVERSIBLE) };
}

/** The attributes whose damage an action changed */
export function damagedPropIds(mutations: Mutation[]): string[] {
  const ids = new Set<string>();
  for (const mutation of mutations) {
    mutation.updates?.forEach(update => {
      if (damageOfUpdate(update) !== undefined) ids.add(update.propId);
    });
  }
  return [...ids];
}

/** The properties an action updated or removed, whose owner revertOf needs */
export function changedPropIds(mutations: Mutation[]): string[] {
  const ids = new Set<string>();
  for (const mutation of mutations) {
    mutation.updates?.forEach(update => ids.add(update.propId));
    mutation.removals?.forEach(removal => ids.add(removal.propId));
  }
  return [...ids];
}
