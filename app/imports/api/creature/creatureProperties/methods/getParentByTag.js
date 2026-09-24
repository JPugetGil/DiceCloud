import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { getFilter } from '/imports/api/parenting/parentingFunctions';

function parentByTagQuery(creatureId, tag) {
  return [{
    ...getFilter.descendantsOfRoot(creatureId),
    removed: { $ne: true },
    inactive: { $ne: true },
    tags: tag,
  }, {
    sort: { left: 1 },
  }];
}

export default async function getParentByTag(creatureId, tag) {
  return await CreatureProperties.findOneAsync(...parentByTagQuery(creatureId, tag));
}

/**
 * Client only: the synchronous twin, for reactive computeds that cannot await.
 * It reads minimongo, and findOne throws on the server.
 */
export function getParentByTagSync(creatureId, tag) {
  return CreatureProperties.findOne(...parentByTagQuery(creatureId, tag));
}
