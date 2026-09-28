import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { assertAdmin } from '/imports/api/sharing/sharingPermissions';
// `Migrations` is a server-only global (percolate:migrations exports it through
// Meteor's global-imports on the server only), and run() below bails out on the
// client before touching it. Importing it here instead put the server-only
// package into the client's module graph, which the client build cannot resolve.

const dbVersionToGitVersion = {
  0: '2.0-beta.32 and lower',
  1: '2.0-beta.33',
}

const getVersion = new ValidatedMethod({
  name: 'admin.getVersion',
  validate: null,
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run() {
    if (Meteor.isClient) return;
    await assertAdmin(this.userId);
    const dbVersion = await Migrations.getVersion();
    return {
      dbVersion,
      gitVersion: dbVersionToGitVersion[dbVersion],
    }
  },
});

export default getVersion;
