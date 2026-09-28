import { JsonRoutes } from 'meteor/simple:json-routes';
import handleErrorAsJson from '/imports/api/rest/server/middleware/handleErrorAsJson';
import '/imports/api/rest/server/restLogin';
import { Meteor } from 'meteor/meteor';

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
