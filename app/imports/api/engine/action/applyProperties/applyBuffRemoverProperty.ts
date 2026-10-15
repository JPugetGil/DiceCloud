import { PropTask } from '/imports/api/engine/action/tasks/Task';
import TaskResult from '/imports/api/engine/action/tasks/TaskResult';
import getPropertyTitle from '/imports/api/utility/getPropertyTitle';
import { findLast, filter, difference, intersection } from 'lodash';
import { getPropertiesOfType, getPropertyAncestors } from '/imports/api/engine/loadCreatures';
import getEffectivePropTags from '/imports/api/engine/computation/utility/getEffectivePropTags';
import { applyDefaultAfterPropTasks, applyTaskToEachTarget } from '/imports/api/engine/action/functions/applyTaskGroups';
import { EngineAction } from '/imports/api/engine/action/EngineActions';
import InputProvider from '/imports/api/engine/action/functions/userInput/InputProvider';
import { CreaturePropertyTypes } from '/imports/api/creature/creatureProperties/CreatureProperties';
import { WHOLE } from '/imports/api/creature/log/logViews';
import { logLine, msg } from '/imports/api/creature/log/logMessages';
import { targetSight } from '/imports/api/engine/action/functions/hiddenStats';

export default async function applyBuffRemoverProperty(
  task: PropTask, action: EngineAction, result: TaskResult, userInput: InputProvider
) {
  const prop = task.prop as CreaturePropertyTypes['buffRemover'];

  const targetIds = prop.target === 'self' ? [action.creatureId] : task.targetIds;

  if (prop.name) {
    // Log Name: the actor's own property's
    result.appendLog({
      name: getPropertyTitle(prop),
      silenced: prop.silent,
      targetView: WHOLE,
      hiddenTargetView: WHOLE,
    }, task.targetIds)
  }

  // The parent buff is on the creature running the action, whoever the
  // targets are: an event with none (a library's "roll the stats" button)
  // still removes the buff it comes in
  if (prop.targetParentBuff) {
    const ancestors = await getPropertyAncestors(action.creatureId, prop._id);
    const nearestBuff = findLast(ancestors, ancestor => ancestor.type === 'buff');
    if (!nearestBuff) {
      result.appendLog({
        name: 'Error', i18n: { name: { key: 'logs.error' } },
        value: 'Buff remover does not have a parent buff to remove',
        silenced: prop.silent,
        hiddenTargetView: WHOLE,
      }, task.targetIds);
      return;
    }
    // The actor's own buff
    removeBuff(nearestBuff, prop, result, true);
    return await applyDefaultAfterPropTasks(action, prop, task.targetIds, userInput);
  }

  if (targetIds.length > 1) {
    return await applyTaskToEachTarget(action, task, targetIds, userInput);
  }

  if (!targetIds.length) {
    return await applyDefaultAfterPropTasks(action, prop, task.targetIds, userInput);
  }

  if (targetIds.length !== 1) {
    throw 'At this step, only a single target is supported'
  }
  const targetId = targetIds[0];

  // A target hidden from the actor's readers, which the browser's simulation
  // leaves to the server: its buffs unread, none removed on a guess
  const sight = await targetSight(action, targetId, userInput);
  if (sight === 'unresolved') {
    return await applyDefaultAfterPropTasks(action, prop, task.targetIds, userInput);
  }

  // Remove the target's buffs that match the tags
  const allBuffs = await getPropertiesOfType(targetId, 'buff');
  const targetedBuffs = filter(allBuffs, (buff): boolean => {
    if (buff.inactive) return false;
    if (buffRemoverMatchTags(prop, buff)) return true;
    return false;
  });
  if (prop.removeAll) {
    // Remove all matching buffs
    targetedBuffs.forEach(buff => {
      removeBuff(buff, prop, result);
    });
  } else {
    // Sort in reverse order
    targetedBuffs.sort((a, b) => b.left - a.left);
    // Remove the one with the highest order
    const buff = targetedBuffs[0];
    if (buff) {
      removeBuff(buff, prop, result);
    }
  }
  return await applyDefaultAfterPropTasks(action, prop, task.targetIds, userInput);
}

function removeBuff(buff: any, prop, result: TaskResult, actorsOwn = false) {
  result.mutations.push({
    targetIds: result.targetIds,
    removals: [{ propId: buff._id }],
    // A buff of the target's: its players read which. The readers it is
    // hidden from read the name of a condition, which the board shows them
    // (partyBoard.js), and "An effect" for any other buff: its effects are
    // its game master's (phase 2.3 of the monsters)
    contents: [{
      name: 'Removed', i18n: { name: { key: 'logs.removed' } },
      value: `${buff.name || 'Buff'}`,
      ...prop.silent && { silenced: true },
      targetView: WHOLE,
      hiddenTargetView: actorsOwn || isCondition(buff) ? WHOLE : logLine({
        name: msg('logs.removed'), value: msg('logs.anEffect'),
      }),
    }],
  });
}

// A condition, as the board shows it to the players: a buff its library tags
// `condition` (conditions.js)
const isCondition = (buff: any) => !!buff.tags?.includes('condition');

function buffRemoverMatchTags(buffRemover, prop) {
  let matched = false;
  const propTags = getEffectivePropTags(prop);
  // A buff with any tag of a NOT group is never removed. This was checked
  // inside the forEach below, whose `return false` only left its callback, and
  // with intersection(), an array, always true: NOT removed those buffs too
  if (buffRemover.extraTags?.some(extra => extra.operation === 'NOT'
    && intersection(extra.tags || [], propTags).length)) {
    return false;
  }
  // Check the target tags
  if (
    !buffRemover.targetTags?.length ||
    difference(buffRemover.targetTags, propTags).length === 0
  ) {
    matched = true;
  }
  // Or all the tags of one of the OR groups
  buffRemover.extraTags?.forEach(extra => {
    if (extra.operation === 'OR') {
      if (matched) return;
      if (
        !extra.tags.length ||
        difference(extra.tags, propTags).length === 0
      ) {
        matched = true;
      }
    }
  });
  return matched;
}
