import { Migrations } from 'meteor/percolate:migrations';
import SCHEMA_VERSION from '/imports/constants/SCHEMA_VERSION';

// Moved out of /imports/constants/MAINTENANCE_MODE.js.
//
// percolate:migrations is a server-only Atmosphere package. While that startup
// check lived in the constants module, the client pulled the package into its
// module graph too (constants/MAINTENANCE_MODE is imported by the router).
// Meteor's own bundler tolerated that; a module bundler resolves imports
// statically and fails on the stub, which has no client-side `Migrations` export.
Meteor.startup(async () => {
  const dbVersion = await Migrations.getVersion();
  // If there are no users, this is a new DB, set the version to latest
  const aUser = await Meteor.users.findOneAsync({});
  const latestVersion = Migrations._list[Migrations._list.length - 1].version
  if (!aUser && dbVersion !== latestVersion) {
    await Migrations._collection.updateAsync({ _id: 'control' }, { version: latestVersion });
    return;
  }
  // Otherwise put the app in maintenance mode if it's not the right version
  if (
    !Meteor.settings.public.maintenanceMode &&
    dbVersion !== undefined &&
    SCHEMA_VERSION !== dbVersion
  ) {
    Meteor.settings.public.maintenanceMode = {
      reason: 'App data needs to be migrated to the latest version'
    };
  }
});
