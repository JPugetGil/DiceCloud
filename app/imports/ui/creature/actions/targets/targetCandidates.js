import { Meteor } from 'meteor/meteor';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import {
  TARGET_CANDIDATE_FIELDS, creatureKind, orderTargetCandidates, targetCandidateIds, targetPickingOf,
} from '/imports/api/creature/creatureFolders/targetCandidates';

/*
 * Whom an action may target, as the sheet's target picker offers it (phases
 * 2.1 to 2.3 of the monsters): the rules of api/creature/creatureFolders/
 * targetCandidates.ts, which Discord's /action applies too, on what the sheet
 * subscribes to (useCharacterParties): the parties (characterParties) and
 * their boards (partyBoard), which hold their creatures.
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

// The rules, which Discord's /action shares (api/creature/creatureFolders/targetCandidates.ts)
export { creatureKind };

/**
 * The creatures the user may target in those parties: the actor first, then
 * in initiative order during a fight (as the board), else in the folders'
 * order. Each with its `kind`. From the creatures the browser has
 */
export function targetCandidates(actorId, parties, user = Meteor.user()) {
  const creatures = Creatures.find({ _id: { $in: targetCandidateIds(actorId, parties) } }, {
    fields: TARGET_CANDIDATE_FIELDS,
  }).fetch();
  return orderTargetCandidates(actorId, parties, creatures, user);
}

/**
 * Whether the action of this property, in the hands of this creature, opens
 * the target picker, and how (targetPickingOf): during a fight by itself
 * (`auto`), from "Target…" whenever (`always`). Undefined when not; else
 * whether it takes a single target, whether the picker lists the fighting
 * parties alone (`fighting`, by itself) or all of them, and whether it
 * preselects (during a fight, Q1)
 */
export function targetPicking(creatureId, prop, mode) {
  if (!mode || !prop || prop.target === 'self') return undefined;
  const fightingParties = partiesOf(creatureId, { fighting: true });
  return targetPickingOf(prop, mode, {
    fighting: fightingParties.length > 0,
    othersToTarget: () => targetCandidates(creatureId, fightingParties).some(creature => creature._id !== creatureId),
  });
}
