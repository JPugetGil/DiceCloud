import migrateProperty2To3 from '/imports/migrations/archive/properties/migrateProperty2To3';
import errorText from '/imports/api/utility/errorText';

export default function migrateApiCreature2To3(creature) {
  creature.creatureProperties = creature.creatureProperties
    .sort((a, b) => a.order - b.order)
    .map(prop => {
      try {
        migrateProperty2To3(prop);
      } catch (e) {
        console.warn('Property migration 2 -> 3 failed: ', { propId: prop._id, error: errorText(e) });
      }
      return prop;
    });
}
