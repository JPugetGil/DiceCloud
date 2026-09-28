import type { Meteor } from 'meteor/meteor';
import type { NpmModuleMongodb } from 'meteor/npm-mongo';

type SimpleSchema = import('simpl-schema').default;
type TypedSimpleSchema<T> = import('/imports/api/utility/TypedSimpleSchema').TypedSimpleSchema<T>;

declare module 'meteor/mongo' {
  namespace Mongo {
    interface CollectionStatic {
      // dburles:mongo-collection-instances
      get<T extends NpmModuleMongodb.Document>(
        collectionName: string, options?: { connection: Meteor.Connection }
      ): Mongo.Collection<T>;
      getAll(): { name: string, instance: Mongo.Collection<any>, options: any }[];
    }
    type SchemaOptions = {
      /**
       * Set to `true` if your document must be passed through the collection's transform to properly validate
       */
      transform?: boolean,
      /**
       * Set to `true` to replace any existing schema instead of combining
       */
      replace?: boolean
      selector?: any;
    }

    // aldeed:collection2. Augments Meteor's interface, so the type parameters
    // have to match its own even where this file does not read them
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface Collection<T extends NpmModuleMongodb.Document, U = T> {
      schema: TypedSimpleSchema<T>;
      simpleSchema<V extends Partial<T>>(selector?: V): TypedSimpleSchema<T & V>;
      /**
       * Use this method to attach a schema to a collection created by another package,
       * such as Meteor.users. It is most likely unsafe to call this method more than
       * once for a single collection, or to call this for a collection that had a
       * schema object passed to its constructor.
       * @param ss SimpleSchema instance or a schema definition object from which to create a new SimpleSchema instance
       * @param options Options
       *
       */
      attachSchema(ss: SimpleSchema | TypedSimpleSchema<T>, options?: SchemaOptions): void;
      updateAsync(
        selector: Selector<T> | ObjectID | string,
        modifier: Modifier<T>,
        options?: {
          multi?: boolean | undefined;
          upsert?: boolean | undefined;
          arrayFilters?: Array<{ [identifier: string]: any }> | undefined;
          // collection2's options
          selector?: Record<string, any>;
          getAutoValues?: boolean;
          bypassCollection2?: boolean;
        },
      ): Promise<number>;
    }
  }
}
