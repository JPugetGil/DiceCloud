// The server-side schema-version check that used to live here now runs from
// /imports/server/config/maintenanceModeCheck.js, so that this module stays
// safe for the client to import.
const MAINTENANCE_MODE = Meteor.settings.public.maintenanceMode;
export default MAINTENANCE_MODE;
