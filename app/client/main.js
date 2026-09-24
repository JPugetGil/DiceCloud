// Meteor client entry point (meteor.mainModule.client in package.json), which is
// also the entry Rspack compiles the browser bundle from.
//
// Order matters:
//  - simpleSchemaConfig registers the app's custom schema options and has to run
//    before any schema is defined.
//  - aldeed:collection2 v4 only attaches attachSchema() to Mongo.Collection once
//    its main module has been dynamically imported, and sibling static imports of
//    this file would evaluate before that promise settles, defining their
//    collections too early. Everything that reaches a collection is therefore
//    imported dynamically, after the load below.
import { Collection2 } from 'meteor/aldeed:collection2';
import '/imports/api/simpleSchemaConfig';

await Collection2.load();

await import('/imports/client/ui/vueSetup');
await import('/imports/client/ui/styles/stylesIndex');
await import('/imports/client/config');
await import('/imports/client/serviceWorker');
