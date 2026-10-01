import { autorun } from 'vue-meteor-tracker';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { getFilter } from '/imports/api/parenting/parentingFunctions';

/**
 * How far a character's build is: the slots that expect a choice and are in
 * play (active, their condition met, not hidden by the player), and how many
 * of them have it. Choosing opens more slots (a race's subrace), so the total
 * grows with the build. `getCreatureId` returns the character's id.
 */
export default function useBuildProgress(getCreatureId) {
  return autorun(() => {
    const creatureId = getCreatureId();
    if (!creatureId) return { total: 0, done: 0 };
    const required = CreatureProperties.find({
      ...getFilter.descendantsOfRoot(creatureId),
      type: 'propertySlot',
      'quantityExpected.value': { $gt: 0 },
      ignored: { $ne: true },
      removed: { $ne: true },
      inactive: { $ne: true },
      $or: [
        { 'slotCondition.value': { $nin: [false, 0, ''] } },
        { 'slotCondition.value': { $exists: false } },
      ],
    }, { fields: { spaceLeft: 1 } }).fetch();
    return {
      total: required.length,
      done: required.filter(slot => !(slot.spaceLeft > 0)).length,
    };
  }).result;
}
