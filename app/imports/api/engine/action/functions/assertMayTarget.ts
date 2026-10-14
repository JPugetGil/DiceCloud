import { Meteor } from 'meteor/meteor';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import { partyLetsTarget, type PartyFolder } from '/imports/api/creature/creatureFolders/party';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import { englishMessage } from '/imports/api/creature/log/logMessages';
import type Task from '/imports/api/engine/action/tasks/Task';

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

type Targeted = { _id: string, owner?: string, type?: string, writers?: string[] };

/**
 * Throws unless the user may apply the task, with the actor, to the target:
 * - they may edit the target, as before;
 * - or the party lets them (partyLetsTarget): a folder, not archived, holds
 *   both, the user sits at its table, the actor and the target are the
 *   table's, and the target is a player character. And the user may edit the
 *   actor, and the task applies an action or a spell (PARTY_TASKS).
 *
 * Called by insertAction, and again by runAction: the user may have left the
 * party, or been removed from it, since. The refusal names no creature: the
 * user may not even read the target
 */
export default async function assertMayTarget(
  actor: Targeted | undefined, target: Targeted | undefined, userId: string | null | undefined, task: Pick<Task, 'subtaskFn'>,
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
  }, { fields: { owner: 1, members: 1, creatures: 1, archived: 1 } }).fetchAsync() as PartyFolder[];
  if (folders.some(folder => partyLetsTarget(folder, userId, actor, target))) return;
  throw refusal();
}

/** In English, and in the reader's language through its details */
function refusal() {
  const key = 'targetPicker.errors.denied';
  // any: Meteor's types say details are a string; DDP sends any EJSON value
  return new Meteor.Error('Edit permission denied', englishMessage(key), { i18n: { key } } as any);
}
