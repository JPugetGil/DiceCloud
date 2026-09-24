// public/sw.js serves cached copies of files that lack Meteor's ?hash= query.
// In development the bundler serves modules at stable, unhashed URLs, so the
// worker hands out stale modules and, when a fetch fails, cached HTML in place
// of JavaScript. It is only registered in production; in development any earlier
// registration is removed.
Meteor.startup(() => {
  if (!('serviceWorker' in navigator)) return;
  if (Meteor.isProduction) {
    navigator.serviceWorker.register('/sw.js')
      .catch(error => console.log('ServiceWorker registration failed: ', error));
  } else {
    navigator.serviceWorker.getRegistrations()
      .then(registrations => registrations.forEach(registration => registration.unregister()));
  }
});
