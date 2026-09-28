// A simple endpoint that does a single round trip to the database to check everything is working
import { JsonRoutes } from 'meteor/simple:json-routes';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';

const HealthCheckCollection = new Mongo.Collection('healthCheck');

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

// GET /api/status: 200 when the database returns the health check document,
// 503 when the database can't be reached, 500 otherwise
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
