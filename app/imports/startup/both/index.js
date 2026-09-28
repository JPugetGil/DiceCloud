// Startup shared by the client and the server, imported first by
// imports/startup/client and imports/startup/server.
//
// - simpleSchemaConfig registers the app's custom schema options and has to run
//   before any schema is defined.
// - aldeed:collection2 v4 only attaches attachSchema() to Mongo.Collection once
//   its main module has been dynamically imported. Collections defined before
//   this promise settles would have no schema, so everything that reaches a
//   collection is imported dynamically, after this module.
import { Collection2 } from 'meteor/aldeed:collection2';
import '/imports/api/simpleSchemaConfig';

await Collection2.load();
