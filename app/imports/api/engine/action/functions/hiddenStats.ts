import { getCreature } from '/imports/api/engine/loadCreatures';
import { hidesStatsFromPlayers } from '/imports/api/creature/creatureFolders/boardMonsters';

/*
 * A game master's creature, a monster or a non-player character, keeps its
 * hit points from the players (partyBoard.js): when a player's character acts
 * on it, the character's log says the damage dealt, never what it did to the
 * creature's hit points, which would give them away once capped by what it
 * had left. The creature's own log, its game master's, has it all
 * (writeActionResults.ts).
 */

type Typed = { type?: string } | undefined | null;

/** Whether the target's stats are hidden from whoever plays the actor */
export function hidesStatsOf(actor: Typed, target: Typed): boolean {
  return !!target && hidesStatsFromPlayers(target) && !hidesStatsFromPlayers(actor);
}

/**
 * The creatures among `targetIds` whose stats the actor's player must not
 * learn. On a client that has not the creatures, none: the server's result
 * replaces the simulation's, and the client cannot compute their hit points
 * anyway
 */
export async function hiddenTargets(actorId: string, targetIds: string[] = []): Promise<string[]> {
  const others = [...new Set(targetIds)].filter(id => id && id !== actorId);
  if (!others.length) return [];
  const actor = await getCreature(actorId);
  if (hidesStatsFromPlayers(actor)) return [];
  const hidden: string[] = [];
  for (const id of others) {
    if (hidesStatsOf(actor, await getCreature(id))) hidden.push(id);
  }
  return hidden;
}
