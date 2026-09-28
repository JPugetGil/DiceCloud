import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { assertCanManageRoles } from '/imports/api/users/assertRolePermissions';
import { ROLE_ORDER, replaceRole } from '/imports/api/users/roles';
import { Meteor } from 'meteor/meteor';

/**
 * Admin only: make a user a player, an active player, or an admin. Roles
 * outside that hierarchy, like docsWriter, are kept.
 */
const setUserRole = new ValidatedMethod({
  name: 'admin.setUserRole',
  validate: new SimpleSchema({
    userId: {
      type: String,
      max: 32,
    },
    role: {
      type: String,
      allowedValues: [...ROLE_ORDER],
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 10,
    timeInterval: 5000,
  },
  async run({ userId, role }) {
    if (Meteor.isClient) return;
    await assertCanManageRoles(this.userId);
    // Admins can't demote themselves, so there is always an admin left
    if (userId === this.userId) {
      throw new Meteor.Error('Permission denied',
        'You can\'t change your own role, ask another admin');
    }
    const user = await Meteor.users.findOneAsync(userId, { fields: { roles: 1 } });
    if (!user) {
      throw new Meteor.Error('User not found',
        'No user has this id');
    }
    await Meteor.users.updateAsync(userId, {
      $set: { roles: replaceRole(user.roles, role) },
    });
  },
});

export default setUserRole;
