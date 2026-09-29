import { Meteor } from 'meteor/meteor';

// Set by hand in the settings (public.maintenanceMode, optionally with a
// `reason`) to send everyone but admins to the maintenance page.
const MAINTENANCE_MODE = Meteor.settings.public.maintenanceMode;
export default MAINTENANCE_MODE;
