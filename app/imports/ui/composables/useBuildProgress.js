import { autorun } from 'vue-meteor-tracker';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import buildSteps from '/imports/ui/creature/slots/buildSteps';

/**
 * How far a character's build is, in named steps (UX12, buildSteps): the
 * steps, how many there are (`total`), are `done`, and are `left` to do now,
 * and the `next` one. The choices a step opens count in it, so the count
 * does not go back as the build grows. `getCreatureId` returns the
 * character's id.
 */
export default function useBuildProgress(getCreatureId) {
  return autorun(() => {
    const creatureId = getCreatureId();
    if (!creatureId) return buildSteps([]);
    const slots = CreatureProperties.find({
      ...getFilter.descendantsOfRoot(creatureId),
      type: 'propertySlot',
      'quantityExpected.value': { $gt: 0 },
      ignored: { $ne: true },
      removed: { $ne: true },
    }, {
      fields: {
        name: 1, left: 1, right: 1, slotTags: 1, quantityExpected: 1, spaceLeft: 1,
        'slotCondition.value': 1, inactive: 1,
      },
    }).fetch();
    return buildSteps(slots);
  }).result;
}
