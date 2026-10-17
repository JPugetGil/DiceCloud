import initiativeOrder from '/imports/api/creature/creatureFolders/initiativeOrder';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import { partyLetsTarget, type PartyFolder } from '/imports/api/creature/creatureFolders/party';

/*
 * Whom an action may target, and when the target picker opens (phases 2.1 to
 * 2.3 of the monsters): the creatures of the parties its creature plays in
 * that the server lets the user target (assertMayTarget). Those the user may
 * edit: the game master's monsters and the party's characters for the game
 * master (joining makes them an editor of the characters), a player's own
 * characters for the player. And the table's player characters, for whoever
 * sits at it, with a character of the table (partyLetsTarget): a player heals
 * or buffs the other players' characters. And the game master's monsters and
 * non-player characters for a player, unless the game master turned that off
 * (playersTargetMonsters): the server tells the player the results alone.
 *
 * The rules alone, on the creatures and parties given: the sheet's target
 * picker gives what the browser has (ui/creature/actions/targets/
 * targetCandidates.js), Discord's /action what the database holds
 * (discord/server/interactions/actionTargets.ts).
 */

/** A party as the rules read it: who sits at it, its creatures, its fight */
export type CandidateParty = PartyFolder & {
  _id?: string,
  initiative?: { round?: number, entries?: { creatureId?: string, initiative?: number, bonus?: number, name?: string }[] },
};

/** A creature as the rules read it, and as the picker shows it */
export type CandidateCreature = {
  _id: string, name?: string, picture?: string, avatarPicture?: string, color?: string,
  type?: string, owner?: string, writers?: string[],
};

/** What the picker reads of a creature */
export const TARGET_CANDIDATE_FIELDS = Object.freeze({
  name: 1, picture: 1, avatarPicture: 1, color: 1, type: 1, owner: 1, writers: 1,
});

/** 'monster' for a game master's monster, as the board shows it; 'character' otherwise */
export const creatureKind = (creature?: { type?: string }): 'monster' | 'character' => creature?.type === 'monster'
  ? 'monster' : 'character';

/** The creatures to read for the picker: the actor, then its parties' creatures, once each */
export function targetCandidateIds(actorId: string, parties: CandidateParty[]): string[] {
  return [...new Set([actorId, ...parties.flatMap(party => party.creatures || [])])];
}

/**
 * The creatures the user may target in those parties, among those given: the
 * actor first, then in initiative order during a fight (as the board), else
 * in the folders' order. Each with its `kind`
 */
export function orderTargetCandidates<C extends CandidateCreature>(
  actorId: string, parties: CandidateParty[], creatures: C[], user: { _id: string, roles?: string[] } | null | undefined,
): (C & { kind: 'monster' | 'character' })[] {
  const ids = targetCandidateIds(actorId, parties);
  const rank = new Map<string, number>();
  for (const party of parties) {
    if (!party.initiative?.round) continue;
    initiativeOrder(party.initiative.entries || []).forEach((entry: { creatureId?: string }) => {
      if (entry.creatureId && !rank.has(entry.creatureId)) rank.set(entry.creatureId, rank.size);
    });
  }
  const byId = new Map(creatures.map(creature => [creature._id, creature]));
  const actor = byId.get(actorId);
  const mayTarget = (creature: C) => creature._id === actorId || hasEditPermission(creature as any, user)
    || parties.some(party => partyLetsTarget(party, user?._id, actor, creature));
  return ids
    .map((id, index) => ({ creature: byId.get(id), index }))
    .filter((item): item is { creature: C, index: number } => !!item.creature && mayTarget(item.creature))
    .sort((a, b) => {
      if (a.creature._id === actorId) return -1;
      if (b.creature._id === actorId) return 1;
      return (rank.get(a.creature._id) ?? Infinity) - (rank.get(b.creature._id) ?? Infinity) || a.index - b.index;
    })
    .map(({ creature }) => ({ ...creature, kind: creatureKind(creature) }));
}

/** How the target picker opens for an action: one target or several, the fighting parties alone, preselected */
export type TargetPicking = { single: boolean, fighting: boolean, preselect: boolean };

/**
 * Whether the action of this property, in the hands of its creature, opens
 * the target picker, and how: during a fight by itself (`auto`), from
 * "Target…" whenever (`always`). Not for an action on its creature alone,
 * nor, by itself, for an event or when the user may target nothing but the
 * actor (`othersToTarget`, asked only then). Undefined when not; else whether
 * it takes a single target, whether the picker lists the fighting parties
 * alone (`fighting`, by itself) or all of them, and whether it preselects
 * (during a fight, Q1). `fighting`: whether a party of the creature fights
 */
export function targetPickingOf(
  prop: { target?: string, actionType?: string } | undefined, mode: 'auto' | 'always' | undefined,
  { fighting, othersToTarget }: { fighting: boolean, othersToTarget: () => boolean },
): TargetPicking | undefined {
  if (!mode || !prop || prop.target === 'self') return undefined;
  if (mode === 'auto') {
    // Nor by itself for an event's button, an action on the sheet itself:
    // the libraries leave most on a single target, their default ("Save
    // failed" of the death saves, a wild shape's forms: 128 of 141 in Vexus)
    if (prop.actionType === 'event') return undefined;
    if (!fighting) return undefined;
    if (!othersToTarget()) return undefined;
  }
  return {
    single: prop.target !== 'multipleTargets',
    fighting: mode === 'auto',
    preselect: fighting,
  };
}
