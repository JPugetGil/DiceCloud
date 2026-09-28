import { Collection2 } from 'meteor/aldeed:collection2';
import '/imports/api/simpleSchemaConfig';

// aldeed:collection2 v4 only attaches attachSchema() to Mongo.Collection once
// its main module has been dynamically imported, and Meteor's module system does
// not hold back the sibling imports of this file while a top-level await is
// pending - they evaluate straight away and define their collections too early.
// Importing them dynamically below is what actually sequences this.
await Collection2.load();

await import('/imports/server/config/SimpleRestConfig');
await import('/imports/server/config/limitLoginTokens');
await import('/imports/server/rest/index');
await import('/imports/server/config/accountsEmailConfig');
await import('/imports/server/config/SyncedCronConfig');
await import('/imports/server/config/redisCaching');
await import('/imports/server/publications/index');
await import('/imports/server/cron/deleteSoftRemovedDocuments');
await import('/imports/api/parenting/organizeMethods');
await import('/imports/migrations/server/index');
await import('/imports/migrations/methods/index');
await import('/imports/server/config/maintenanceModeCheck');
await import('/imports/api/creature/creatureProperties/methods/index');
await import('/imports/api/creature/archive/methods/index');
await import('/imports/api/creature/creatures/methods/index');
await import('/imports/api/engine/action/methods/index');
await import('/imports/api/sharing/sharing');
await import('/imports/server/config/publicationStrategies');
