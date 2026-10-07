import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { escapeRegExp } from 'lodash';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { assertCanManageRoles } from '/imports/api/users/assertRolePermissions';
import { getUserRole } from '/imports/api/users/roles';
import { Meteor } from 'meteor/meteor';

export const SEARCH_USERS_LIMIT = 25;

/**
 * Admin only: find users by id, or by part of their username or email address,
 * newest first. Without a search, lists the newest users.
 */
const searchUsers = new ValidatedMethod({
  name: 'admin.searchUsers',
  validate: new SimpleSchema({
    search: {
      type: String,
      optional: true,
      max: 100,
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 10,
    timeInterval: 5000,
  },
  async run({ search }) {
    if (Meteor.isClient) return;
    await assertCanManageRoles(this.userId);

    let filter = {};
    const text = search?.trim();
    if (text) {
      const pattern = new RegExp(escapeRegExp(text), 'i');
      filter = {
        $or: [
          { _id: text },
          { username: pattern },
          { 'emails.address': pattern },
        ],
      };
    }
    const users = await Meteor.users.find(filter, {
      fields: { username: 1, emails: 1, roles: 1, fileStorageUsed: 1 },
      sort: { createdAt: -1 },
      limit: SEARCH_USERS_LIMIT,
    }).fetchAsync();

    // How many player characters each user owns, to compare with their role's
    // limit, which their monsters don't count towards
    const characterCounts = {};
    const ownerCounts = await Creatures.rawCollection().aggregate([
      { $match: { owner: { $in: users.map(user => user._id) }, type: 'pc' } },
      { $group: { _id: '$owner', count: { $sum: 1 } } },
    ]).toArray();
    for (const { _id, count } of ownerCounts) {
      characterCounts[_id] = count;
    }

    return users.map(user => ({
      _id: user._id,
      username: user.username,
      email: user.emails?.[0]?.address,
      role: getUserRole(user),
      characterCount: characterCounts[user._id] || 0,
      fileStorageUsed: user.fileStorageUsed || 0,
    }));
  },
});

export default searchUsers;
