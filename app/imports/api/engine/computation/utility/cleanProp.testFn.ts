import type { SetRequired } from 'type-fest';
import type { CreatureProperty, CreaturePropertyTypes } from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { cleanAndValidate } from '/imports/api/utility/TypedSimpleSchema';

export default function cleanProp<T extends SetRequired<Partial<CreatureProperty>, 'type'>>(prop: T): CreaturePropertyTypes[T['type']] {
  if (!prop.root) {
    prop.root = { collection: 'creatures', id: 'testCreature' }
  }
  const schema = CreatureProperties.simpleSchema(prop);
  return cleanAndValidate(schema, prop as Partial<CreatureProperty>) as CreaturePropertyTypes[T['type']];
}
