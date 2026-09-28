// Client startup, imported by client/main.js.
//
// This module's body only runs once imports/startup/both has loaded
// collection2. Everything after it is imported dynamically, in order: another
// static import here would evaluate alongside imports/startup/both, before
// collection2 is loaded, and define its collections without their schema.
import '/imports/startup/both';

await import('./connectionConfig');
await import('./markedConfig');
await import('./serviceWorker');

// The Vue app, mounted once Meteor has started
await import('/imports/ui/main');
