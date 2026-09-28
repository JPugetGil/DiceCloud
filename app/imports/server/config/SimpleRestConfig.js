import { JsonRoutes } from 'meteor/simple:json-routes';
import handleErrorAsJson from '/imports/server/rest/middleware/handleErrorAsJson';

Meteor.startup(() => {
  // Enable cross origin requests for all endpoints
  JsonRoutes.setResponseHeaders({
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  });
});

// All errors are handled as JSON
JsonRoutes.ErrorMiddleware.use(handleErrorAsJson);

// The guard that used to live here only existed to suppress the routes
// simple:rest registered on its own for every ValidatedMethod. That package has
// no Meteor 3 release and RestMethodMixin was never used, so it is gone and the
// only routes left are the ones this app registers explicitly under 'api/'.

import '/imports/server/rest/restLogin';
