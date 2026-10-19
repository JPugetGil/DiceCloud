// Registers the custom schema options (index, computedField, ...) before any
// definition uses them, whichever entry point or test file loads first
import '/imports/api/simpleSchemaConfig';
import SimpleSchema from 'meteor/aldeed:simple-schema';
import type { SchemaDefinition, SchemaDefinitionType, SimpleSchemaDefinition } from 'simpl-schema';
import type {
  FieldToCalculate, CalculatedOnlyField
} from '/imports/api/properties/subSchemas/computedField';
import type {
  InlineCalculationFieldToCompute, ComputedOnlyInlineCalculationField
} from '/imports/api/properties/subSchemas/inlineCalculationField';
import type { Simplify } from 'type-fest';

// The types createPropertySchema replaces with the computed fields' subschemas
export type ComputedFieldType = 'fieldToCompute' | 'computedOnlyField'
  | 'inlineCalculationFieldToCompute' | 'computedOnlyInlineCalculationField';

// A field's definition as SimpleSchema takes it, with the computed types
// createPropertySchema replaces, and enums written `as const` (readonly)
type FieldDefinition = Omit<SchemaDefinition, 'type' | 'allowedValues'> & {
  type: SchemaDefinitionType | ComputedFieldType,
  allowedValues?: readonly any[] | (() => readonly any[]),
};

// It DOES NOT support a constructor with multiple schemas.
export type Definition = {
  [key: string]: SchemaDefinitionType | SchemaDefinitionType[] | FieldDefinition,
};

// This is a no-op wrapper, effectively implementing a phantom type.
export class TypedSimpleSchema<T> extends SimpleSchema {
  private constructor(definition: Definition) {
    // The computed types are gone by now (createPropertySchema), and a
    // readonly enum is still an array: SimpleSchema's own type has neither
    super(definition as SimpleSchemaDefinition);
  }
  static from<D extends Definition>(definition: D): TypedSimpleSchema<InferSchema<D>> {
    return new TypedSimpleSchema(definition);
  }
  clean(...args: Parameters<SimpleSchema['clean']>): unknown {
    return super.clean(...args);
  }
  // Extending the schema with another schema &'s their definitions
  // In some cases, this is not strictly accurate, use with caution
  extend<U>(otherSchema: TypedSimpleSchema<U>): TypedSimpleSchema<Simplify<T & U>> {
    return super.extend(otherSchema) as TypedSimpleSchema<Simplify<T & U>>;
  }
  // The keys of the fields tagged so (simpleSchemaConfig.js, storeTaggedKeys)
  declare removeBeforeComputeFields: () => string[];
  declare inlineCalculationFields: () => string[];
  declare computedFields: () => string[];
}

// Assertions cannot be methods due to https://github.com/microsoft/TypeScript/issues/36931.
export function validate<T>(schema: TypedSimpleSchema<T>, value: unknown): asserts value is T {
  schema.validate(value);
}

export function cleanAndValidate<T extends { _id?: string }>(schema: TypedSimpleSchema<T>, doc: Partial<T>): T {
  const cleanDoc = schema.clean(doc);
  validate(schema, cleanDoc);
  return cleanDoc;
}

// If this type emerges anywhere in calculations, congratulations!
// You've just hit an unimplemented corner case :D
type NotImplementedMarker = { readonly NotImplementedMarker: unique symbol };

// Internal calculation markers.
type ArrayMarker = { readonly ArrayMarker: unique symbol };
type ObjectMarker = { readonly ObjectMarker: unique symbol };

export type InferType<T> = T extends TypedSimpleSchema<infer X> ? X : never;

// Infer TypeScript type from SimpleSchema type.
type InferTypeInner<T> =
  T extends typeof Array ? ArrayMarker :
  T extends typeof Boolean ? boolean :
  // SimpleSchema's `Function` type maps to the bare Function type by definition
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  T extends typeof Function ? Function :
  T extends typeof Number ? number :
  T extends typeof SimpleSchema.Integer ? number :
  T extends typeof Object ? ObjectMarker :
  T extends typeof String ? string :
  T extends typeof Date ? Date :
  T extends RegExp ? string :
  T extends TypedSimpleSchema<infer U> ? U :
  // Any other schema as a type is SimpleSchema.oneOf(...), which the app only
  // gives primitives (its type keeps no trace of which)
  T extends SimpleSchema ? string | number | boolean :
  NotImplementedMarker;

// Infer TypeScript type from a single field definition.
export type InferField<Def extends Definition, Key extends keyof Def> =
  Key extends string
  ? Def[Key] extends { type: infer Typ }
  ? ArrayMarker extends InferTypeInner<Typ>
  ? Array<InferField<Def, `${Key}.$`>>
  : ObjectMarker extends InferTypeInner<Typ>
  ? MakeUndefinedOptional<{ [L in keyof Def as L extends `${Key}.${infer SubKey}` ? SubKey extends `${string}.${string}` ? never : SubKey : never]: InferOptional<Def, L, InferField<Def, L>> }>
  : Def[Key] extends { allowedValues: infer Allowed extends readonly (string | number)[] } ? InferOptional<Def, Key, InferEnum<Allowed>>
  : Def[Key] extends { type: 'fieldToCompute' } ? FieldToCalculate
  : Def[Key] extends { type: 'computedOnlyField' } ? CalculatedOnlyField
  : Def[Key] extends { type: 'inlineCalculationFieldToCompute' } ? InlineCalculationFieldToCompute
  : Def[Key] extends { type: 'computedOnlyInlineCalculationField' } ? ComputedOnlyInlineCalculationField
  : InferOptional<Def, Key, InferTypeInner<Typ>>
  : NotImplementedMarker
  : NotImplementedMarker

// Infer union from string array (allowedValues should me marked as const for this to work)
type InferEnum<T extends readonly (string | number)[]> = T[number];

// Infer optional from optional field
type InferOptional<Def, Key extends keyof Def, U> = Def[Key] extends { optional: true } ? U | undefined : U;

type MakeUndefinedOptional<Type> = Simplify<{
  [Property in keyof Type as undefined extends Type[Property] ? never : Property]: Type[Property];
} & {
  [Property in keyof Type as undefined extends Type[Property] ? Property : never]?: Type[Property];
}>;

// Infer TypeScript type from a schema definition.
export type InferSchema<Def extends Definition> = MakeUndefinedOptional<InferField<
  { '': { type: typeof Object } }
  & { [Key in keyof Def as Key extends string ? `.${Key}` : never]: Def[Key] }, ''
>>;

export type ConvertToUnion<T> = T[keyof T];

type KeysOfUnion<T> = T extends unknown ? keyof T : never;

/**
 * A union whose members may all be read for any member's field: a field a
 * member lacks reads undefined, as it does on the document. Narrowing by a
 * discriminant (`type`) still gives the member's own fields
 */
export type StrictUnion<T, TAll = T> = T extends unknown
  ? T & Partial<Record<Exclude<KeysOfUnion<TAll>, keyof T>, undefined>>
  : never;
