declare module 'meteor/mdg:validated-method' {
  // Augments the upstream interfaces in @types/meteor-mdg-validated-method, so the
  // type parameters have to match theirs even where this file does not read them
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ValidatedMethodOptionsMixinFields<TRunArg, TRunReturn> {
    rateLimit: {
      numRequests: number,
      timeInterval: number,
    };
    // simpleSchemaMixin (imports/api/creature/mixins/simpleSchemaMixin.js): the
    // schema that validates the argument, a SimpleSchema or its definition
    schema?: object;
    // and its options (clean, filter...), which it defaults
    schemaValidatorOptions?: object;
  }
  type Return<TFunc> = TFunc extends (...args: any[]) => infer TReturn ? TReturn : never;
  type Argument<TFunc> = TFunc extends (...args: infer TArgs) => any ? TArgs extends [infer TArg] ? TArg
    : NoArguments
    : never;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ValidatedMethod<TName extends string, TRun extends (...args: any[]) => any> {
    // Meteor 3: a promise of the method's result, never a callback
    callAsync: Argument<TRun> extends NoArguments
      ? (unusedArg?: any) => Promise<Awaited<Return<TRun>>>
      : (arg: Argument<TRun>) => Promise<Awaited<Return<TRun>>>;
  }
}
