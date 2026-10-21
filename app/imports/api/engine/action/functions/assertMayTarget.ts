import { Meteor } from 'meteor/meteor';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { partyLetsTarget, type PartyFolder } from '/imports/api/creature/creatureFolders/party';
import { hidesStatsFromPlayers } from '/imports/api/creature/creatureFolders/boardMonsters';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import { englishMessage } from '/imports/api/creature/log/logMessages';
import type Task from '/imports/api/engine/action/tasks/Task';
import type { Shared } from '/imports/api/sharing/SharingSchema';

/*
 * Who may target whom with an action (phase 2.2 of the monsters). The server's
 * rule alone: the browser's simulation of insertAction cannot judge it (it may
 * not have the parties), and a refusal there would fail the call before it
 * reaches the server (ValidatedMethod throws its stub's exceptions).
 */

// The tasks a party member may send at a creature they may not edit: an
// action or a spell of their character, which apply its own properties. Never
// a check, a rest, a change to an attribute, damage typed in, or ammunition,
// which act on the target directly (§1.2 of SPEC-phases-2-3.md)
const PARTY_TASKS: (string | undefined)[] = [undefined, 'castSpell'];

// A creature, as its sharing (hasEditPermission) and its party
// (partyLetsTarget) read it
type Targeted = Shared & { _id: string, type?: string };

/**
 * Throws unless the user may apply the task, with the actor, to the target:
 * - they may edit the target, as before;
 * - or the party lets them (partyLetsTarget): a folder, not archived, holds
 *   both, the user sits at its table, the actor and the target are the
 *   table's, and the target is a player character, or the game master's
 *   monster or non-player character while the game master lets the players
 *   target them (playersTargetMonsters). And the user may edit the actor, and
 *   the task applies an action or a spell (PARTY_TASKS), which sets none of
 *   the target's values, nor removes its buffs unless it is the game
 *   master's monster or non-player character (writesOnTarget).
 *
 * Called by insertAction, and again by runAction: the user may have left the
 * party, or been removed from it, since. The refusal names no creature: the
 * user may not even read the target
 */
export default async function assertMayTarget(
  actor: Targeted | undefined, target: Targeted | undefined, userId: string | null | undefined,
  task: Pick<Task, 'subtaskFn'> & { prop?: { _id: string } },
): Promise<void> {
  if (!target) throw new Meteor.Error('not-found', 'Target creature does not exist');
  if (!userId) throw refusal();
  const user = await Meteor.users.findOneAsync(userId, { fields: { roles: 1 } });
  if (hasEditPermission(target, user)) return;
  if (!actor || !hasEditPermission(actor, user)) throw refusal();
  if (!PARTY_TASKS.includes(task.subtaskFn)) throw refusal();
  const folders = await CreatureFolders.find({
    creatures: { $all: [actor._id, target._id] },
    archived: { $ne: true },
    $or: [{ owner: userId }, { members: userId }],
  }, { fields: { owner: 1, members: 1, creatures: 1, archived: 1, playersTargetMonsters: 1 } }).fetchAsync() as PartyFolder[];
  const letting = folders.filter(folder => partyLetsTarget(folder, userId, actor, target));
  if (!letting.length) throw refusal();
  // A dispel on the game master's monster is play, which the game master
  // oversees; on another player's character, it is not
  const gmCreature = letting.some(folder => hidesStatsFromPlayers(target, folder.owner));
  if (task.prop?._id && await writesOnTarget(actor._id, task.prop._id, { buffRemovers: !gmCreature })) {
    throw refusal('targetPicker.errors.foreignWrite');
  }
}

/**
 * Whether applying the property to another's creature would write on it
 * directly, which nothing undoes outside an encounter: an adjustment that sets
 * a value, or (with `buffRemovers`) a buff remover, aimed at the target, or
 * carried by a buff the target receives, whose "self" is then the target. A
 * player's character may hurt, heal, roll against or put a condition on
 * another's creature, never set its stats, nor strip the buffs of another
 * player's character (decisions of 2026-10-21). A buff's remover of its own
 * parent buff (a condition that ends itself on a save) stays allowed.
 * Checked on the property and all it holds, whichever branch would run
 */
async function writesOnTarget(actorId: string, propId: string, { buffRemovers }: { buffRemovers: boolean }) {
  const prop = await CreatureProperties.findOneAsync(
    { _id: propId, 'root.id': actorId }, { fields: { left: 1, right: 1 } },
  );
  if (!prop) return false;
  type Node = { type: string, left: number, right: number, target?: string, operation?: string, targetParentBuff?: boolean };
  const nodes = await CreatureProperties.find({
    'root.id': actorId,
    removed: { $ne: true },
    left: { $gte: prop.left, $lte: prop.right },
    right: { $lte: prop.right },
    type: { $in: ['adjustment', 'buffRemover', 'buff'] },
  } as any, { fields: { type: 1, left: 1, right: 1, target: 1, operation: 1, targetParentBuff: 1 } }).fetchAsync() as Node[];
  // A missing target is the schemas' default: the target
  const aimsAtTarget = (node: Node) => (node.target ?? 'target') === 'target';
  const buffsOnTarget = nodes.filter(node => node.type === 'buff' && aimsAtTarget(node));
  const inBuffOnTarget = (node: Node) => buffsOnTarget.some(buff => buff.left < node.left && buff.right > node.right);
  return nodes.some(node => {
    const writes = (node.type === 'adjustment' && node.operation === 'set')
      || (buffRemovers && node.type === 'buffRemover' && !node.targetParentBuff);
    return writes && (aimsAtTarget(node) || inBuffOnTarget(node));
  });
}

/** In English, and in the reader's language through its details */
function refusal(key = 'targetPicker.errors.denied') {
  // any: Meteor's types say details are a string; DDP sends any EJSON value
  return new Meteor.Error('Edit permission denied', englishMessage(key), { i18n: { key } } as any);
}
