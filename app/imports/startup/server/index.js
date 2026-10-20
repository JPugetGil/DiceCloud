// Server startup, imported by server/main.js.
//
// This module's body only runs once imports/startup/both has loaded
// collection2. Everything after it is imported dynamically, in order: another
// static import here would evaluate alongside imports/startup/both, before
// collection2 is loaded, and define its collections without their schema.
import '/imports/startup/both';
// Static, unlike the modules below: SyncedCron reads its options in its own
// Meteor.startup, which runs while this module awaits them. It defines no
// collection, so it needs no collection2
import './syncedCronConfig';

// Package configuration
await import('./simpleRestConfig');
await import('./limitLoginTokens');
await import('./accountsEmailConfig');
await import('./publicationRateLimit');

// The version shown to the users, in the public settings
await import('/imports/api/version/server/appVersion');

// REST routes, publications, cron jobs and methods
await import('./register-api');

await import('./publicationStrategies');
