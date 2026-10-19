import type { CreatureProperty } from '/imports/api/creature/creatureProperties/CreatureProperties';
import type { PartialDeep } from 'type-fest';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { applyNestedSetProperties } from '/imports/api/parenting/parentingFunctions';
import { cleanAndValidate } from '/imports/api/utility/TypedSimpleSchema';
import { Random } from 'meteor/random';

// A property as a test writes it: what the schema fills in when it cleans
// it, defaults and auto values (the ids of its rows), left out
export type ForestProp = PartialDeep<CreatureProperty, { recurseIntoArrays: true }> & {
  type: CreatureProperty['type'];
  children?: ForestProp[];
}

/**
 * Take a forest of props, which can have sub-props nested in children: [], and return a list of
 * clean props with correct tree and ancestry data
 * @param props 
 * @returns 
 */
export default function propsFromForest(
  props: ForestProp[],
  creatureId = Random.id(),
  parentId?: string,
  recursionDepth = 0
) {
  const result: CreatureProperty[] = [];
  props.forEach(prop => {
    const children = prop.children;
    // Check the property has a type
    if (!prop.type) {
      throw new Error('Type is required on every property, not found on doc: ' + JSON.stringify(prop, null, 2));
    }
    // Create the clean doc
    const doc = {
      ...prop,
      left: result.length,
      root: { id: creatureId, collection: 'creatures' },
    };
    if (parentId) {
      doc.parentId = parentId;
    }
    if (!doc._id) {
      doc._id = Random.id();
    }
    delete doc.children;
    // Cleaning fills in what the test left out, and validates the rest
    const partialDoc = doc as Partial<CreatureProperty>;
    const creatureProp = cleanAndValidate(CreatureProperties.simpleSchema(partialDoc), partialDoc);

    // Add the doc to the result and ancestry
    result.push(creatureProp);
    if (children) {
      result.push(...propsFromForest(children, creatureId, doc._id, recursionDepth + 1));
    }
  });

  // Apply the nested set properties on the top level
  if (recursionDepth === 0) {
    applyNestedSetProperties(result);
  }
  return result;
}
