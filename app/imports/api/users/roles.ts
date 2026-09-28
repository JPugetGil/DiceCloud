import prettyBytes from 'pretty-bytes';

/**
 * User roles, from least to most permissive. A user's role is stored in their
 * `roles` array, next to roles outside this hierarchy such as 'docsWriter'.
 * A user holding none of these roles is a player, so accounts created before
 * roles existed are players.
 */
export const ROLES = {
  player: 'player',
  activePlayer: 'activePlayer',
  admin: 'admin',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const ROLE_ORDER: readonly Role[] = [ROLES.player, ROLES.activePlayer, ROLES.admin];

const MB = 1_000_000;

export type RolePermissions = {
  // How many characters the user may own, Infinity for no limit
  characterLimit: number,
  // Whether the user may create libraries and library collections. Every role
  // may subscribe to them.
  canCreateLibraries: boolean,
  // Bytes the user's uploaded files (images and character archives) may take
  fileStorageLimit: number,
  // Whether the user may change other users' roles
  canManageRoles: boolean,
};

export const ROLE_PERMISSIONS: Readonly<Record<Role, Readonly<RolePermissions>>> = {
  player: {
    characterLimit: 3,
    canCreateLibraries: false,
    fileStorageLimit: 25 * MB,
    canManageRoles: false,
  },
  activePlayer: {
    characterLimit: Infinity,
    canCreateLibraries: true,
    fileStorageLimit: 100 * MB,
    canManageRoles: false,
  },
  // Admins have the active player's permissions, and can manage roles
  admin: {
    characterLimit: Infinity,
    canCreateLibraries: true,
    fileStorageLimit: 100 * MB,
    canManageRoles: true,
  },
};

type UserWithRoles = { roles?: string[] } | null | undefined;

export function isRole(value: unknown): value is Role {
  return ROLE_ORDER.includes(value as Role);
}

export function getUserRole(user: UserWithRoles): Role {
  const roles = user?.roles || [];
  // Should a user hold more than one role, the most permissive one applies
  for (let i = ROLE_ORDER.length - 1; i > 0; i--) {
    if (roles.includes(ROLE_ORDER[i])) return ROLE_ORDER[i];
  }
  return ROLES.player;
}

export function getUserPermissions(user: UserWithRoles): Readonly<RolePermissions> {
  return ROLE_PERMISSIONS[getUserRole(user)];
}

/**
 * The user's roles with their role replaced by the given one. Roles outside the
 * hierarchy are kept. Players hold none of the hierarchy's roles, which is what
 * every account without a role already is.
 */
export function replaceRole(roles: string[] | undefined, role: Role): string[] {
  const otherRoles = (roles || []).filter(r => !isRole(r));
  if (role === ROLES.player) return otherRoles;
  return [...otherRoles, role];
}

/**
 * Why the user can't create a character when they already own
 * `ownedCharacterCount` of them, undefined if they can
 */
export function getCharacterLimitError(
  user: UserWithRoles, ownedCharacterCount: number
): string | undefined {
  const { characterLimit } = getUserPermissions(user);
  if (ownedCharacterCount < characterLimit) return;
  return `You can own up to ${characterLimit} characters. Archive or delete one,` +
    ' or ask an admin to make you an active player.';
}

/** Why the user can't create a library or library collection, undefined if they can */
export function getLibraryCreationError(user: UserWithRoles): string | undefined {
  if (getUserPermissions(user).canCreateLibraries) return;
  return 'Players can subscribe to libraries but not create them.' +
    ' Ask an admin to make you an active player.';
}

/**
 * Why the user can't store a file of `fileSize` bytes on top of the files they
 * already have, undefined if they can
 */
export function getFileStorageError(
  user: UserWithRoles & { fileStorageUsed?: number }, fileSize: number
): string | undefined {
  const { fileStorageLimit } = getUserPermissions(user);
  const used = user?.fileStorageUsed || 0;
  if (used + fileSize <= fileStorageLimit) return;
  const available = Math.max(fileStorageLimit - used, 0);
  return `Not enough storage: this file takes ${prettyBytes(fileSize)}, and only` +
    ` ${prettyBytes(available)} of your ${prettyBytes(fileStorageLimit)} are free.` +
    ' Delete some files to make room.';
}
