// aldeed:simple-schema ships no types: it is the simpl-schema npm package
// (1.x), which @types/simpl-schema describes. Without this, the module was
// `any`, TypedSimpleSchema had none of SimpleSchema's methods, and no schema
// definition could be checked
declare module 'meteor/aldeed:simple-schema' {
  import SimpleSchema from 'simpl-schema';
  export default SimpleSchema;
  export * from 'simpl-schema';
}
