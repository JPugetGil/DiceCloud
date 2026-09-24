import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { assertAdmin } from '/imports/api/sharing/sharingPermissions';

const validateDatabase = new ValidatedMethod({
  name: 'validateDatabase',
  validate: null,
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 1,
    timeInterval: 10000,
  },
  async run() {
    await assertAdmin(this.userId);
    // Very computationally expensive data diagnostics.
    // Only run in an offline instance you control, by starting the server with
    // VALIDATE_DATABASE=1 in the environment.
    if (Meteor.isClient || !process.env.VALIDATE_DATABASE) return;

    // for...of rather than forEach: an async callback handed to forEach is
    // never awaited.
    for (const collection of Meteor.Collection.getAll()) {
      // `continue`, not `return`: this was a forEach callback, where returning
      // only skipped that one collection.
      if (!collection.instance._c2?._simpleSchemas) continue;
      await collection.instance.find({}).forEachAsync(doc => {
        const schema = collection.instance.simpleSchema(doc);
        let cleanDoc = schema.clean(doc);
        try {
          schema.validate(cleanDoc, { modifier: false });
        } catch (e) {
          console.log(collection.name, doc._id, e.message || e.reason || e.toString());
        }
      });
    }
  },
});

export default validateDatabase;
