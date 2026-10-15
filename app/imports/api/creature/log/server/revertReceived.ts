import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import CreatureLogs, { insertCreatureLogWork } from '/imports/api/creature/log/CreatureLogs';
import { hiddenFrom } from '/imports/api/creature/creatureFolders/boardMonsters';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import { restore, softRemove } from '/imports/api/parenting/softRemove';
import { EngineAction } from '/imports/api/engine/action/EngineActions';
import applyAction from '/imports/api/engine/action/functions/applyAction';
import writeActionResults from '/imports/api/engine/action/functions/writeActionResults';
import getAutomaticInputProvider from '/imports/api/engine/action/functions/userInput/getAutomaticInputProvider';
import { getActionDiceRoller, getHiddenDiceRoller } from '/imports/api/engine/action/functions/userInput/server/actionDice';
import TaskResult from '/imports/api/engine/action/tasks/TaskResult';
import { reloadCachedProperties } from '/imports/api/engine/loadCreatures';
import computeCreature from '/imports/api/engine/computeCreature';
import { englishMessage, logLine, msg, type LogPart } from '/imports/api/creature/log/logMessages';
import { isCurrentEncounter, type Encounter } from '/imports/api/creature/creatureFolders/server/encounters';
import type { RevertOp } from '/imports/api/creature/log/receivedRevert';
import getPropertyTitle from '/imports/api/utility/getPropertyTitle';

/*
 * Undoing what another creature's action did to a creature (phase 2.4 of the
 * monsters, the method creatureLogs.revertReceived): from its received
 * entry's `revert` (receivedRevert.ts), which the server wrote with it.
 *
 * - Who: whoever may edit the creature, its owner and its party's game
 *   master (a writer of the party's characters, the owner of its monsters).
 *   A refusal says nothing of the entry or the creature, to someone who may
 *   not even read them (a player and a monster's entry).
 * - When: while the encounter the entry happened in lasts (encounters.ts).
 * - Once: the entry is marked undone by a conditional write before anything
 *   changes; two undos at once, the second finds it marked and is refused.
 *   The undos of one creature run one after the other: each reads the
 *   attributes as the one before left them, and their limits hold.
 * - What: the buffs it put on the creature go, those it removed come back,
 *   then each attribute gets the opposite of what the action did to it,
 *   through the engine's damageProp on the creature itself: no more than it
 *   lacks comes back, no more than it has is taken; its own damage triggers
 *   fire, as for any change to its attributes. Whatever happened since (a
 *   heal, another hit) stays: an undo takes back this entry's changes alone.
 *   A value the action set stays as it is, and the entry says so.
 * - Told: an entry "Effect undone by <user>" in the creature's own log, with
 *   what came back, posted to its Discord channels as any of its entries is,
 *   once per channel. A monster's log is its game master's, and a monster
 *   posts to none of its party's channels: undoing a player's effect on a
 *   monster tells the players one neutral line, in the log of the player's
 *   character and so in its channels, the party's once: "The GM undid:
 *   <action> → <monster>". The action and the monster's name alone, which
 *   the player read already (tellActor).
 */

type ReceivedEntry = {
  _id: string,
  creatureId: string,
  content?: { name?: string, i18n?: { name?: LogPart } }[],
  received?: {
    fromCreatureId?: string,
    actionName?: string,
    revert?: RevertOp[],
    irreversible?: string[],
    encounter?: Encounter,
    undone?: unknown,
  },
};

type Undone = { by: string, name?: string, at: Date };

// The refusals, in English and in the reader's language through their details
function refusal(code: 'denied' | 'alreadyUndone' | 'encounterOver' | 'nothing') {
  const key = `log.undo.errors.${code}`;
  // any: Meteor's types say details are a string; DDP sends any EJSON value
  return new Meteor.Error(`revertReceived.${code}`, englishMessage(key), { i18n: { key } } as any);
}

// The undos of each creature, one after the other (in this server process)
const queues = new Map<string, Promise<unknown>>();

function inTurn<T>(creatureId: string, task: () => Promise<T>): Promise<T> {
  const next = (queues.get(creatureId) ?? Promise.resolve()).catch(() => undefined).then(task);
  queues.set(creatureId, next);
  next.finally(() => {
    if (queues.get(creatureId) === next) queues.delete(creatureId);
  }).catch(() => undefined);
  return next;
}

/** Undoes a received entry for a user, or throws why not (refusal) */
export default async function revertReceived(logId: string, userId: string | null | undefined): Promise<void> {
  const log = await CreatureLogs.findOneAsync(logId, {
    fields: { creatureId: 1, content: 1, received: 1 },
  }) as ReceivedEntry | undefined;
  const creature = log?.received && await Creatures.findOneAsync(log.creatureId, {
    fields: { owner: 1, writers: 1 },
  });
  const user = userId ? await Meteor.users.findOneAsync(userId, { fields: { roles: 1, username: 1 } }) : undefined;
  if (!log?.received || !creature || !user || !hasEditPermission(creature as any, user as any)) throw refusal('denied');
  await inTurn(log.creatureId, () => undo(log, user as { _id: string, username?: string }));
}

async function undo(log: ReceivedEntry, user: { _id: string, username?: string }) {
  const received = log.received!;
  if (received.undone) throw refusal('alreadyUndone');
  if (!received.revert?.length) throw refusal('nothing');
  if (!await isCurrentEncounter(received.encounter, log.creatureId)) throw refusal('encounterOver');
  const undone: Undone = { by: user._id, ...user.username && { name: user.username }, at: new Date() };
  // Marked first: whoever comes second finds it undone
  // any: the logs' collection is JavaScript, its ids typed as ObjectIds
  const claimed = await CreatureLogs.updateAsync(
    { _id: log._id, received: { $exists: true }, 'received.undone': { $exists: false } } as any,
    { $set: { 'received.undone': undone } },
  );
  if (!claimed) throw refusal('alreadyUndone');
  await applyRevert(log, received.revert, received.irreversible || [], undone);
  await tellActor(log, received);
}

/**
 * A player's effect on a game master's monster undone: the player's
 * character's log gets "The GM undid: <action> → <monster>", which posts to
 * its channels as its entries do, the party's once. Only the monsters'
 * editors undo their entries: their game master (or an admin). Nothing else:
 * not a number, not a line of the effect or of its undo, nothing of the
 * monster but its name, which the board shows
 */
async function tellActor(log: ReceivedEntry, received: NonNullable<ReceivedEntry['received']>) {
  if (!received.fromCreatureId) return;
  const fields = { name: 1, type: 1, owner: 1 };
  const [target, actor] = await Promise.all([
    Creatures.findOneAsync(log.creatureId, { fields }),
    Creatures.findOneAsync(received.fromCreatureId, { fields }),
  ]) as ({ _id: string, name?: string, type?: string, owner?: string } | undefined)[];
  if (!target || !actor || !hiddenFrom(actor, target)) return;
  await insertCreatureLogWork({
    log: {
      creatureId: actor._id,
      content: [logLine({
        name: msg('logs.gmUndid', { action: received.actionName ?? msg('logs.anEffect'), target: target.name || '?' }),
      })],
    },
  });
}

async function applyRevert(log: ReceivedEntry, ops: RevertOp[], irreversible: string[], undone: Undone) {
  const { creatureId } = log;
  const lines: ReturnType<typeof logLine>[] = [];

  // The buffs first: a buff's change to a maximum is in place before the
  // attributes are given back. The creature's own properties alone: an entry
  // copied with its creature, or restored from a file, names another's
  let buffsChanged = false;
  for (const op of ops) {
    if (op.op === 'remove') {
      const prop = await CreatureProperties.findOneAsync({ _id: op.propId, 'root.id': creatureId, removed: { $ne: true } });
      if (!prop) continue;
      await softRemove(CreatureProperties, prop);
      lines.push(logLine({ name: msg('logs.withdrawn'), value: getPropertyTitle(prop) }));
      buffsChanged = true;
    } else if (op.op === 'restore') {
      // Removed by the action itself, not with something removed since
      const prop = await CreatureProperties.findOneAsync({
        _id: op.propId, 'root.id': creatureId, removed: true, removedWith: { $exists: false },
      });
      if (!prop) continue;
      await restore(CreatureProperties, prop);
      lines.push(logLine({ name: msg('logs.restoredEffect'), value: getPropertyTitle(prop) }));
      buffsChanged = true;
    }
  }
  if (buffsChanged) {
    await reloadCachedProperties(creatureId);
    await computeCreature(creatureId);
  }
  // The engine reads the creature's cache, which its observers update some
  // time after a write: it may still hold what the hit wrote before the
  // computation bounded it (a value below 0), and damageProp's limits would
  // then give back more than was taken. As stored, computed
  await reloadCachedProperties(creatureId);

  // Then the attributes, by the creature itself, through the engine. In
  // memory, as a turn's events: inserting it would end the action its
  // player has under way (insertAction)
  const changes = ops.flatMap(op => op.op === 'inc' && Number.isFinite(op.amount)
    ? [{ propId: op.propId, value: -op.amount }] : []);
  const action: EngineAction = {
    _id: Random.id(),
    creatureId,
    task: { subtaskFn: 'undoReceived', targetIds: [creatureId], params: { changes } },
    results: [],
    taskCount: 0,
  };
  if (changes.length) {
    const dice = { _id: action._id as string, seed: Random.secret() };
    await applyAction(action, getAutomaticInputProvider(action, getActionDiceRoller(dice), getHiddenDiceRoller(dice)));
  }

  // "Effect undone by <user>", which entry, what the buffs did; what the
  // attributes did follows; what stays as it was ends it
  const heading = log.content?.[0];
  const title = new TaskResult([creatureId]);
  title.appendLog(logLine({
    name: msg('logs.undoneBy', { name: undone.name ?? msg('logs.someone') }),
    ...heading && { value: heading.i18n?.name ?? heading.name ?? '' },
    silenced: false,
  }), [creatureId]);
  for (const line of lines) title.appendLog({ ...line, silenced: false }, [creatureId]);
  action.results.unshift(title);
  if (irreversible.length) {
    const kept = new TaskResult([creatureId]);
    kept.appendLog(logLine({ name: msg('logs.notUndone'), value: irreversible.join(', '), silenced: false }), [creatureId]);
    action.results.push(kept);
  }
  // Written, computed, logged on the creature and posted to its channels
  await writeActionResults(action);
}
