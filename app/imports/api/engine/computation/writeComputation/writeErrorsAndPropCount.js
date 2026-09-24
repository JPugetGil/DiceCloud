import Creatures from '/imports/api/creature/creatures/Creatures';
import VERSION from '/imports/constants/VERSION';

export default async function writeErrorsAndPropCount(creatureId, errors = [], propCount) {
  if (errors.length) {
    await Creatures.updateAsync(creatureId, {
      $set: {
        computeErrors: errors,
        propCount,
        lastComputedAt: new Date(),
        computeVersion: VERSION,
      }
    });
  } else {
    await Creatures.updateAsync(creatureId, {
      $set: {
        propCount,
        lastComputedAt: new Date(),
        computeVersion: VERSION,
      }, $unset: { computeErrors: 1 }
    });
  }
}
