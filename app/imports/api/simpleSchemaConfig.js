import SimpleSchema from 'meteor/aldeed:simple-schema';
import { set } from 'lodash';

// Everything here must be in place before the first schema is *defined*, so it
// all stays synchronous. The entry modules import this first, then await
// Collection2.load() before pulling in anything that declares a collection.

set(Meteor.settings,
  'packages.collection2.disableCollectionNamesInValidation',
  true);

// The app defines its schemas with aldeed:simple-schema, the same class
// aldeed:collection2 v4 builds and merges schemas with. With the npm
// `simpl-schema` package (a separate copy per bundle) collection2 rebuilt the
// per-type property schemas with its own class, which does not recognise the
// other copy's subschemas and silently cleaned their fields away - a property
// icon never reached the database.
// `index`, `unique` and `sparse` come from aldeed:schema-index, the rest are
// this app's own.
const CUSTOM_SCHEMA_OPTIONS = [
  'index',
  'unique',
  'sparse',
  'parseLevel',
  'removeBeforeCompute',
  'inlineCalculationField',
  'computedField',
];

SimpleSchema.extendOptions(CUSTOM_SCHEMA_OPTIONS);

// Store a quick way of referencing keys that have specific tags === true
function storeTaggedKeys(tag, fnName){
  SimpleSchema.prototype[fnName] = function(){
    if (!this['_' + fnName]){
      this['_' + fnName] = [];
      for (const key in this._schema){
        if (this._schema[key][tag]){
          this['_' + fnName].push(key);
        }
      }
    }
    return this['_' + fnName];
  }
}

// Keys that should be deleted at the start of a computation
storeTaggedKeys('removeBeforeCompute', 'removeBeforeComputeFields');
// Keys that represent inline calculation objects
storeTaggedKeys('inlineCalculationField', 'inlineCalculationFields');
// Keys that represent computed field objects
storeTaggedKeys('computedField', 'computedFields');
