import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import SimpleSchema from 'meteor/aldeed:simple-schema';
import { assertAdmin } from '/imports/api/sharing/sharingPermissions';
// `Migrations` is a server-only global (percolate:migrations exports it through
// Meteor's global-imports on the server only), and run() below bails out on the
// client before touching it. Importing it here instead put the server-only
// package into the client's module graph, which the client build cannot resolve.

const migrateTo = new ValidatedMethod({
  name: 'admin.migrateTo',
  validate: new SimpleSchema({
    version: {
      type: SimpleSchema.oneOf(
        SimpleSchema.Integer,
        String
      ),
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 1,
    timeInterval: 10000,
  },
  async run({ version }) {
    if (Meteor.isClient) return;
    await assertAdmin(this.userId);
    await Migrations.migrateTo(version);
  },
});

export default migrateTo;
