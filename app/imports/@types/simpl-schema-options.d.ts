import 'simpl-schema';

// The field options this app's schemas use beyond SimpleSchema's own:
// `index`, `unique` and `sparse` come from aldeed:schema-index, the others are
// registered by /imports/api/simpleSchemaConfig.js (SimpleSchema.extendOptions)
declare module 'simpl-schema' {
  interface SchemaDefinition {
    index?: 1 | -1 | boolean | string;
    unique?: boolean;
    sparse?: boolean;
    parseLevel?: 'compile' | 'roll' | 'reduce';
    removeBeforeCompute?: boolean;
    inlineCalculationField?: boolean;
    computedField?: boolean;
  }
}
