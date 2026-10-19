import {
  inlineCalculationFieldToCompute,
  computedOnlyInlineCalculationField,
} from '/imports/api/properties/subSchemas/inlineCalculationField';
import {
  fieldToCompute,
  computedOnlyField,
} from '/imports/api/properties/subSchemas/computedField';
import type SimpleSchema from 'meteor/aldeed:simple-schema';
import type { ComputedFieldType, Definition, InferSchema } from '/imports/api/utility/TypedSimpleSchema';
import { TypedSimpleSchema } from '/imports/api/utility/TypedSimpleSchema';

// Search through the schema for keys whose type is 'fieldToCompute' etc.
// replace the type with Object and attach extend the schema with
// the required fields to make the computation work
export default function createPropertySchema<D extends Definition>(definition: D): TypedSimpleSchema<InferSchema<D>> {
  const computationFields: Record<ComputedFieldType, string[]> = {
    inlineCalculationFieldToCompute: [],
    computedOnlyInlineCalculationField: [],
    fieldToCompute: [],
    computedOnlyField: [],
  };
  const isComputedType = (type: unknown): type is ComputedFieldType => typeof type === 'string' && type in computationFields;

  for (const key in definition) {
    // Edited in place: its computed type becomes Object, its default moves
    const def: any = definition[key];
    if (typeof def === 'object' && 'type' in def && isComputedType(def.type)) {
      computationFields[def.type].push(key);
      applyDefaultCalculationValue(definition, key);
      def.type = Object;
      if (!def.optional) {
        console.warn(
          `computed field: '${key}' of '${def.type}' is expected to be optional`
        );
      }
      if (def.removeBeforeCompute) {
        console.warn(
          `computed field: '${key}' of '${def.type}' should not be removed before computation`
        )
      }
    }
  }

  // Create a schema with the edited definition
  const schema = TypedSimpleSchema.from(definition);
  // InferSchema<D> already types the computed fields: extending only adds
  // their keys to the runtime schema, from untyped subschemas
  const runtimeSchema: SimpleSchema = schema;

  // Extend the schema with all the computation fields
  computationFields.inlineCalculationFieldToCompute.forEach(key => {
    runtimeSchema.extend(inlineCalculationFieldToCompute(key))
  });
  computationFields.computedOnlyInlineCalculationField.forEach(key => {
    runtimeSchema.extend(computedOnlyInlineCalculationField(key))
  });
  computationFields.fieldToCompute.forEach(key => {
    runtimeSchema.extend(fieldToCompute(key))
  });
  computationFields.computedOnlyField.forEach(key => {
    runtimeSchema.extend(computedOnlyField(key))
  });
  return schema
}

function applyDefaultCalculationValue(definition, key) {
  const def = definition[key];
  if (
    def.type === 'computedOnlyField' ||
    def.type === 'computedOnlyInlineCalculationField'
  ) {
    // don't apply defaults to computed only fields
    // because it would add the calculation field which should only appear
    // on the fields to compute
    return;
  }
  const defaultValue = def.defaultValue;
  if (!defaultValue) return;
  let calcField;
  if (def.type === 'fieldToCompute') {
    calcField = key + '.calculation'
  } else {
    calcField = key + '.text'
  }
  if (definition[calcField]) {
    definition[calcField].defaultValue = defaultValue;
  } else {
    definition[calcField] = {
      type: String,
      defaultValue,
      optional: true,
    };
  }
  delete def.defaultValue;
}
