import Creatures from '/imports/api/creature/creatures/Creatures';
import {
  getCharacterLimitError, getLibraryCreationError, getUserPermissions, ROLES,
} from '/imports/api/users/roles';
import { Meteor } from 'meteor/meteor';

async function getUserRoles(userId: string | null | undefined) {
  if (!userId) {
    throw new Meteor.Error('Permission denied',
      'No user ID. Are you logged in?');
  }
  const user = await Meteor.users.findOneAsync(userId, { fields: { roles: 1 } });
  if (!user) {
    throw new Meteor.Error('Permission denied',
      'No such user exists');
  }
  return user;
}

/**
 * Assert that the user's role lets them own one more character. Every character
 * the user owns counts, however it was made: created, restored from an archive
 * or imported.
 */
export async function assertCanCreateCharacter(userId: string | null | undefined): Promise<void> {
  const user = await getUserRoles(userId);
  // Roles without a limit don't need the count
  if (getUserPermissions(user).characterLimit === Infinity) return;
  const ownedCharacterCount = await Creatures.find({ owner: user._id }).countAsync();
  const error = getCharacterLimitError(user, ownedCharacterCount);
  if (error) throw new Meteor.Error('Character limit reached', error);
}

/** Assert that the user's role lets them create libraries and library collections */
export async function assertCanCreateLibrary(userId: string | null | undefined): Promise<void> {
  const user = await getUserRoles(userId);
  const error = getLibraryCreationError(user);
  if (error) throw new Meteor.Error('Permission denied', error);
}

/** Assert that the user's role lets them change other users' roles */
export async function assertCanManageRoles(userId: string | null | undefined): Promise<void> {
  const user = await getUserRoles(userId);
  if (!getUserPermissions(user).canManageRoles) {
    throw new Meteor.Error('Permission denied',
      `Only users with the ${ROLES.admin} role can manage roles`);
  }
}
