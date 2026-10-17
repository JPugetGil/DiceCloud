import type { Mongo } from 'meteor/mongo';
import Creatures from '/imports/api/creature/creatures/Creatures';
import {
  TARGET_CANDIDATE_FIELDS, orderTargetCandidates, targetCandidateIds, type CandidateCreature, type CandidateParty,
} from '/imports/api/creature/creatureFolders/targetCandidates';
import type { LinkedUser } from '/imports/api/discord/server/interactions/interactionCharacters';

/*
 * Whom /action may target (D6), as the sheet's target picker offers it: the
 * rules of targetCandidates.ts, on the database's parties and creatures
 * rather than the browser's. The parties are those the character plays in,
 * as characterParties publishes them to its editors; the creatures, theirs.
 * In a fight, the menu lists the fighting parties' creatures alone, as the
 * picker that opens by itself; the `target` option looks in all of them, as
 * "Target…". The server checks each target again (assertMayTarget).
 */

export type Candidate = CandidateCreature & { kind: 'monster' | 'character' };

const PARTY_FIELDS = {
  name: 1, owner: 1, members: 1, creatures: 1, archived: 1, initiative: 1, playersTargetMonsters: 1,
} as const;

async function folders() {
  const { default: CreatureFolders } = await import('/imports/api/creature/creatureFolders/CreatureFolders');
  return CreatureFolders as unknown as Mongo.Collection<CandidateParty & { _id: string }>;
}

/** The parties the creature plays in, by name: those fighting only (a tracker past round 0) with `fighting` */
export async function partiesOfCreature(creatureId: string, { fighting = false } = {}): Promise<CandidateParty[]> {
  return await (await folders()).find({
    creatures: creatureId,
    archived: { $ne: true },
    ...fighting && { 'initiative.round': { $gt: 0 } },
  } as any, { fields: PARTY_FIELDS, sort: { name: 1 } }).fetchAsync();
}

/** The creatures the user may target with the creature, in those parties, the actor first */
export async function candidatesIn(creatureId: string, parties: CandidateParty[], user: LinkedUser): Promise<Candidate[]> {
  const creatures = await Creatures.find(
    { _id: { $in: targetCandidateIds(creatureId, parties) } }, { fields: TARGET_CANDIDATE_FIELDS },
  ).fetchAsync() as CandidateCreature[];
  return orderTargetCandidates(creatureId, parties, creatures, user);
}

/**
 * The creature the `target` option names among the creature's parties:
 * by the id the autocomplete gave, else by its name. `denied` when it is one
 * of theirs that the user may not target (the game master turned that off,
 * or it is not the table's); nothing is said of a creature elsewhere
 */
export async function namedTarget(creatureId: string, user: LinkedUser, value: string): Promise<
  { target: Candidate } | { problem: 'notFound' | 'ambiguous' } | { problem: 'denied', name: string }
> {
  const parties = await partiesOfCreature(creatureId);
  const candidates = await candidatesIn(creatureId, parties, user);
  const typed = value.trim().toLowerCase();
  const byId = candidates.find(candidate => candidate._id === value);
  if (byId) return { target: byId };
  const named = candidates.filter(candidate => (candidate.name || '').trim().toLowerCase() === typed);
  if (named.length === 1) return { target: named[0] };
  if (named.length > 1) return { problem: 'ambiguous' };
  // One of the parties' creatures the user may not target: said so, by the
  // name they typed or the id the autocomplete once gave
  const others = await Creatures.find({
    _id: { $in: targetCandidateIds(creatureId, parties) },
  }, { fields: { name: 1, owner: 1 } }).fetchAsync() as CandidateCreature[];
  const table = new Set(parties.flatMap(party => [party.owner, ...party.members || []]));
  const known = others.find(other => table.has(other.owner) && (other._id === value
    || (other.name || '').trim().toLowerCase() === typed));
  if (known) return { problem: 'denied', name: known.name || '?' };
  return { problem: 'notFound' };
}
