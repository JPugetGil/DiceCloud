import { includes } from 'lodash';
import { fetchDocByRef, getCollectionByName } from '/imports/api/parenting/parentingFunctions';
import type { Shared } from '/imports/api/sharing/SharingSchema';
import type { TreeDoc } from '/imports/api/parenting/ChildSchema';

function assertIdValid(userId: string | undefined | null): asserts userId {
  if (!userId || typeof userId !== 'string') {
    throw new Meteor.Error('Permission denied',
      'No user ID. Are you logged in?');
  }
}

function assertDocExists(doc: Record<string, any> | undefined): asserts doc {
  if (!doc) {
    throw new Meteor.Error('Permission denied',
      'Permission denied: No such document exists');
  }
}

export function assertOwnership(doc: Shared, userId: string): asserts doc {
  assertIdValid(userId);
  assertDocExists(doc);

  if (doc.owner === userId) {
    return;
  } else {
    throw new Meteor.Error('Permission denied',
      'You are not the owner of this document');
  }
}

/**
 * Assert that the user can edit the root document which manages its own sharing
 * permissions.
 *
 * Warning: the doc and userId must be set by a trusted source
 */
/**
 * Whether a user may edit a root document that manages its own sharing
 * permissions, given the user's own document rather than just their id.
 *
 * Synchronous on purpose: on the client the logged-in user is already in
 * minimongo, and a computed property cannot await assertEditPermission.
 */
export function hasEditPermission(
  doc: Shared | undefined, user: { _id: string, roles?: string[] } | null | undefined
): boolean {
  if (!doc || !user) return false;
  // Admin override
  if (user.roles && user.roles.includes('admin')) return true;
  return doc.owner === user._id || includes(doc.writers, user._id);
}

/**
 * Whether a user may copy out of a root document that manages its own sharing
 * permissions. Synchronous, like hasEditPermission.
 */
export function hasCopyPermission(
  doc: Shared | undefined, user: { _id: string, roles?: string[] } | null | undefined
): boolean {
  if (!doc || !user) return false;
  if (hasEditPermission(doc, user)) return true;
  return (includes(doc.readers, user._id) || !!doc.public) && !!doc.readersCanCopy;
}

// These used to carry TypeScript assertion signatures (`: asserts doc`), which
// narrowed the argument for callers. Meteor 3 makes the permission lookups
// async, and an assertion signature cannot be async, so they return
// Promise<void> and callers must await them.
export async function assertEditPermission(doc: Shared | undefined, userId: string | undefined | null): Promise<void> {
  assertIdValid(userId);
  assertDocExists(doc);
  const user = await Meteor.users.findOneAsync(userId, {
    fields: {
      'roles': 1,
    }
  });
  if (!user) {
    throw new Meteor.Error('Edit permission denied',
      'No such user exists');
  }

  if (!hasEditPermission(doc, user)) {
    throw new Meteor.Error('Edit permission denied',
      'You do not have permission to edit this document');
  }
}

/**
 * Assert that the user can edit the root document which manages its own sharing
 * permissions.
 *
 * Warning: the doc and userId must be set by a trusted source
 */
export async function assertCopyPermission(doc: Shared, userId): Promise<void> {
  assertIdValid(userId);
  assertDocExists(doc);
  const user = await Meteor.users.findOneAsync(userId, {
    fields: {
      'roles': 1,
    }
  });

  if (!user) {
    throw new Meteor.Error('Edit permission denied',
      'No such user exists');
  }

  if (!hasCopyPermission(doc, user)) {
    throw new Meteor.Error('Copy permission denied',
      'You do not have permission to copy this document');
  }
}

async function getRoot(doc: TreeDoc | Shared | undefined) {
  assertDocExists(doc);
  if ('root' in doc) {
    return await fetchDocByRef<Shared>(doc.root);
  } else {
    return doc;
  }
}

/**
 * Assert that the user can edit a descendant document whose root ancestor
 * implements sharing permissions.
 *
 * Warning: the doc and userId must be set by a trusted source
 */
export async function assertDocEditPermission(doc: TreeDoc | Shared | undefined, userId: string | null): Promise<void> {
  const root = await getRoot(doc);
  await assertEditPermission(root, userId);
}

/**
 * Assert that the user can copy a descendant document whose root ancestor
 * implements sharing permissions.
 *
 * Warning: the doc and userId must be set by a trusted source
 */
export async function assertDocCopyPermission(doc, userId): Promise<void> {
  const root = await getRoot(doc);
  await assertCopyPermission(root, userId);
}

export async function assertViewPermission(doc, userId): Promise<void> {
  assertDocExists(doc);
  if (doc.public) return;
  assertIdValid(userId);

  if (
    doc.owner === userId ||
    includes(doc.readers, userId) ||
    includes(doc.writers, userId)
  ) {
    return;
  } else {

    // Admin override
    const user = await Meteor.users.findOneAsync(userId, {
      fields: {
        'roles': 1,
      }
    });
    if (!user) {
      throw new Meteor.Error('Edit permission denied',
        'No such user exists');
    }

    if (user.roles && user.roles.includes('admin')) {
      return;
    }

    throw new Meteor.Error('View permission denied',
      'You do not have permission to view this document');
  }
}

/**
 * Assert that the user can view a descendant document whose root ancestor
 * implements sharing permissions.
 *
 * Warning: the doc and userId must be set by a trusted source
 */
/**
 * Client only: synchronous twins of assertDocEditPermission and
 * assertDocCopyPermission, for reactive computeds that cannot await. The root
 * document is read from minimongo, and findOne throws on the server.
 */
function getRootSync(doc: TreeDoc | Shared | undefined) {
  if (!doc) return undefined;
  if ('root' in doc) return getCollectionByName<Shared>(doc.root.collection).findOne(doc.root.id);
  return doc;
}

export function hasDocEditPermission(doc: TreeDoc | Shared | undefined, user): boolean {
  return hasEditPermission(getRootSync(doc), user);
}

export function hasDocCopyPermission(doc: TreeDoc | Shared | undefined, user): boolean {
  return hasCopyPermission(getRootSync(doc), user);
}

export async function assertDocViewPermission(doc, userId): Promise<void> {
  const root = await getRoot(doc);
  await assertViewPermission(root, userId);
}

export async function assertAdmin(userId): Promise<void> {
  assertIdValid(userId);
  const user = await Meteor.users.findOneAsync(userId, { fields: { roles: 1 } });
  if (!user) {
    throw new Meteor.Error('Permission denied',
      'UserId does not match any existing user');
  }
  const isAdmin = user.roles && user.roles.includes('admin')
  if (!isAdmin) {
    throw new Meteor.Error('Permission denied',
      'User does not have the admin role');
  }
}
