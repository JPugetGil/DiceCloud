// A simple endpoint that does a single round trip to the database to check everything is working
import { JsonRoutes } from 'meteor/simple:json-routes';

const HealthCheckCollection = new Mongo.Collection('healthCheck');

// Don't use redis oplog optimization on this collection, we want to hit the database every time
HealthCheckCollection.disableRedis?.();

const healthCheckDoc = {
  status: 'ok',
};

// Add the health check doc on startup if it's missing
// There should only be this single doc in the collection
// A capped collection would be marginally faster, but it's a pain to make one in Meteor
Meteor.startup(async function () {
  if (!await HealthCheckCollection.findOneAsync()) {
    await HealthCheckCollection.insertAsync(healthCheckDoc);
  }
});

// This used to be declared with simple:rest's `Meteor.method()`, which exposed a
// Meteor method over HTTP and set the status code through `this.setHttpStatusCode`.
// simple:rest has no Meteor 3 release, so the endpoint is registered directly on
// JsonRoutes - the same router the rest of the API already uses - and returns the
// same status codes as before.
JsonRoutes.add('get', 'api/status', async function (req, res) {
  let dbHealthDoc;
  try {
    dbHealthDoc = await HealthCheckCollection.findOneAsync();
  } catch {
    JsonRoutes.sendResult(res, { code: 503, data: {} });
    return;
  }
  JsonRoutes.sendResult(res, {
    code: dbHealthDoc?.status === 'ok' ? 200 : 500,
    data: dbHealthDoc || {},
  });
});
