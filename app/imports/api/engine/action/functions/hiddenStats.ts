import { getCreature } from '/imports/api/engine/loadCreatures';
import { hiddenFrom } from '/imports/api/creature/creatureFolders/boardMonsters';
import type { EngineAction } from '/imports/api/engine/action/EngineActions';
import type InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';

/*
 * A game master's creature, a monster or a non-player character, keeps its
 * stats from the players (partyBoard.js): when a player's character acts on
 * it, the character's log says the results — hit or miss, the saving throw
 * made or failed, the damage dealt — never its armor class, saving throws,
 * hit points or effects, which its game master alone reads in its own log
 * (writeActionResults.ts, logViews.ts). Who may see them depends on the
 * owners, not on the types alone (hiddenFrom, boardMonsters.js).
 */

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
  const hidden: string[] = [];
  for (const id of others) {
    if (hiddenFrom(actor, await getCreature(id))) hidden.push(id);
  }
  return hidden;
}

/**
 * How an action sees one of its targets:
 * - 'shown': its readers may read the target's stats, the actor itself, a
 *   player's character, the game master's monster acting on another;
 * - 'hidden': the target is hidden from the actor's readers, and this run
 *   resolves what it does all the same: the server's, which rolls its dice
 *   apart (InputProvider.rollHiddenDice). Only the results reach the actor's
 *   readers, and its scope;
 * - 'unresolved': hidden, and this run cannot resolve it: the browser's
 *   simulation, which never reads the target's stats, never guesses what it
 *   does, and leaves it to the server. A target the browser does not know is
 *   left to the server too.
 */
export type TargetSight = 'shown' | 'hidden' | 'unresolved';

type TargetRead = { hidden: boolean, known: boolean, name?: string };

// Each target read once per action: a fight holds 64 of them, and an action
// asks about each at every property
const reads = new WeakMap<object, Map<string, Promise<TargetRead>>>();

function readTarget(action: EngineAction, targetId: string): Promise<TargetRead> {
  let byTarget = reads.get(action);
  if (!byTarget) {
    byTarget = new Map();
    reads.set(action, byTarget);
  }
  let read = byTarget.get(targetId);
  if (!read) {
    read = (async () => {
      const [actor, target] = await Promise.all([getCreature(action.creatureId), getCreature(targetId)]);
      return { hidden: hiddenFrom(actor, target), known: !!target, name: target?.name };
    })();
    byTarget.set(targetId, read);
  }
  return read;
}

/** How the action sees the target (TargetSight), with what reads its input */
export async function targetSight(
  action: EngineAction, targetId: string | undefined, input: Pick<InputProvider, 'rollHiddenDice'>,
): Promise<TargetSight> {
  if (!targetId || targetId === action.creatureId) return 'shown';
  const { hidden, known } = await readTarget(action, targetId);
  if (input.rollHiddenDice) return hidden ? 'hidden' : 'shown';
  return hidden || !known ? 'unresolved' : 'shown';
}

/** The target's name, which its lines may say whoever reads them */
export async function targetName(action: EngineAction, targetId: string): Promise<string> {
  return (await readTarget(action, targetId)).name || '?';
}
