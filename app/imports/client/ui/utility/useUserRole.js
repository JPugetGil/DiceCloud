import { computed } from 'vue';
import { Meteor } from 'meteor/meteor';
import { autorun } from 'vue-meteor-tracker';
import { getUserRole, ROLE_PERMISSIONS } from '/imports/api/users/roles';

/**
 * The logged in user's role and what it permits (see /imports/api/users/roles),
 * from the roles the `user` publication sends. The server enforces the same
 * limits: this only lets the interface show them.
 */
export default function useUserRole() {
  const role = autorun(() => getUserRole(Meteor.user())).result;
  const permissions = computed(() => ROLE_PERMISSIONS[role.value || 'player']);
  return { role, permissions };
}
