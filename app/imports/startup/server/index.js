// Server startup, imported by server/main.js.
//
// This module's body only runs once imports/startup/both has loaded
// collection2. Everything after it is imported dynamically, in order: another
// static import here would evaluate alongside imports/startup/both, before
// collection2 is loaded, and define its collections without their schema.
import '/imports/startup/both';

// Package configuration
await import('./simpleRestConfig');
await import('./limitLoginTokens');
await import('./accountsEmailConfig');
await import('./syncedCronConfig');
await import('./publicationRateLimit');

// REST routes, publications, cron jobs and methods
await import('./register-api');

// Database migrations, then the check that compares the database's version
// with the app's
await import('/imports/migrations/server/index');
await import('/imports/migrations/methods/index');
await import('./maintenanceModeCheck');

await import('./publicationStrategies');
