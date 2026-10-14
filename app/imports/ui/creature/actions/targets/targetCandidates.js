import { Meteor } from 'meteor/meteor';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import initiativeOrder from '/imports/api/creature/creatureFolders/initiativeOrder';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import { partyLetsTarget } from '/imports/api/creature/creatureFolders/party';

/*
 * Whom an action may target, as the target picker offers it (phases 2.1 and
 * 2.2 of the monsters): the creatures of the parties its creature plays in
 * that the server lets the user target (assertMayTarget). Those the user may
 * edit: the game master's monsters and the party's characters for the game
 * master (joining makes them an editor of the characters), a player's own
 * characters for the player. And the table's player characters, for whoever
 * sits at it, with a character of the table (partyLetsTarget): a player heals
 * or buffs the other players' characters. Not the game master's monsters for
 * a player, until phase 2.3.
 *
 * Reads what the sheet subscribes to (useCharacterParties): the parties
 * (characterParties) and their boards (partyBoard), which hold their
 * creatures.
 */

/**
 * The parties the creature plays in, by name: those fighting only (an
 * initiative tracker past round 0) with `fighting`
 */
export function partiesOf(creatureId, { fighting = false } = {}) {
  if (!creatureId) return [];
  return CreatureFolders.find({
    creatures: creatureId,
    archived: { $ne: true },
    ...fighting && { 'initiative.round': { $gt: 0 } },
  }, { sort: { name: 1 } }).fetch();
}

/**
 * Runs `run` with the parties' boards subscribed, until it settles: the
 * target picker and the cast dialog give their place to the action's own
 * dialog (doAction's replaceDialog), which simulates the action again, and
 * needs the targets' variables and health bars after they unmount
 */
export async function withPartyBoards(parties, run) {
  const handles = parties.map(party => Meteor.subscribe('partyBoard', party._id));
  try {
    return await run();
  } finally {
    handles.forEach(handle => handle.stop());
  }
}

/** Whether the creature is in a fight */
export const isFighting = creatureId => partiesOf(creatureId, { fighting: true }).length > 0;

/** 'monster' for a game master's monster, as the board shows it; 'character' otherwise */
export const creatureKind = creature => creature?.type === 'monster' ? 'monster' : 'character';

/**
 * The creatures the user may target in those parties: the actor first, then
 * in initiative order during a fight (as the board), else in the folders'
 * order. Each with its `kind`
 */
export function targetCandidates(actorId, parties, user = Meteor.user()) {
  const ids = [...new Set([actorId, ...parties.flatMap(party => party.creatures || [])])];
  const rank = new Map();
  for (const party of parties) {
    if (!party.initiative?.round) continue;
    initiativeOrder(party.initiative.entries || []).forEach(entry => {
      if (entry.creatureId && !rank.has(entry.creatureId)) rank.set(entry.creatureId, rank.size);
    });
  }
  const creatures = Creatures.find({ _id: { $in: ids } }, {
    fields: { name: 1, picture: 1, avatarPicture: 1, color: 1, type: 1, owner: 1, writers: 1 },
  }).fetch();
  const byId = new Map(creatures.map(creature => [creature._id, creature]));
  const actor = byId.get(actorId);
  const mayTarget = creature => creature._id === actorId || hasEditPermission(creature, user)
    || parties.some(party => partyLetsTarget(party, user?._id, actor, creature));
  return ids
    .map((id, index) => ({ creature: byId.get(id), index }))
    .filter(({ creature }) => creature && mayTarget(creature))
    .sort((a, b) => {
      if (a.creature._id === actorId) return -1;
      if (b.creature._id === actorId) return 1;
      return (rank.get(a.creature._id) ?? Infinity) - (rank.get(b.creature._id) ?? Infinity) || a.index - b.index;
    })
    .map(({ creature }) => ({ ...creature, kind: creatureKind(creature) }));
}

/**
 * Whether the action of this property, in the hands of this creature, opens
 * the target picker, and how: during a fight by itself (`auto`), from
 * "Target…" whenever (`always`). Not for an action on its creature alone,
 * nor, by itself, for an event or when the user may target nothing but the
 * actor. Undefined
 * when not; else whether it takes a single target, whether the picker lists
 * the fighting parties alone (`fighting`, by itself) or all of them, and
 * whether it preselects (during a fight, Q1)
 */
export function targetPicking(creatureId, prop, mode) {
  if (!mode || !prop || prop.target === 'self') return undefined;
  const fightingParties = partiesOf(creatureId, { fighting: true });
  if (mode === 'auto') {
    // Nor by itself for an event's button, an action on the sheet itself:
    // the libraries leave most on a single target, their default ("Save
    // failed" of the death saves, a wild shape's forms: 128 of 141 in Vexus)
    if (prop.actionType === 'event') return undefined;
    if (!fightingParties.length) return undefined;
    if (!targetCandidates(creatureId, fightingParties).some(creature => creature._id !== creatureId)) return undefined;
  }
  return {
    single: prop.target !== 'multipleTargets',
    fighting: mode === 'auto',
    preselect: fightingParties.length > 0,
  };
}
