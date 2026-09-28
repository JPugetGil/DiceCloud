import { Migrations } from 'meteor/percolate:migrations';
import SCHEMA_VERSION from '/imports/constants/SCHEMA_VERSION';
import { Meteor } from 'meteor/meteor';

// Puts the app in maintenance mode (Meteor.settings.public.maintenanceMode,
// read by /imports/constants/MAINTENANCE_MODE.js) when the database's schema
// version is not the app's. It lives here rather than in that constants module
// because percolate:migrations is server-only, and the client imports the
// constants module.
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
