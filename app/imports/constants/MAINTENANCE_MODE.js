import { Meteor } from 'meteor/meteor';

// The server-side schema-version check that sets this runs from
// /imports/startup/server/maintenanceModeCheck.js, so that this module stays
// safe for the client to import.
const MAINTENANCE_MODE = Meteor.settings.public.maintenanceMode;
export default MAINTENANCE_MODE;
