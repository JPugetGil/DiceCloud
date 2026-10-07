import { assert } from 'chai';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import {
  ROLES, ROLE_PERMISSIONS, getUserRole, getUserPermissions, replaceRole,
  getCharacterLimitError, getLibraryCreationError, getFileStorageError,
} from '/imports/api/users/roles';
import {
  assertCanCreateCharacter, assertCanCreateLibrary, assertCanManageRoles,
} from '/imports/api/users/assertRolePermissions';
import { Meteor } from 'meteor/meteor';

describe('User roles', function () {
  describe('getUserRole', function () {
    it('treats users without a role as players', function () {
      assert.equal(getUserRole(undefined), ROLES.player);
      assert.equal(getUserRole({}), ROLES.player);
      assert.equal(getUserRole({ roles: [] }), ROLES.player);
      assert.equal(getUserRole({ roles: ['docsWriter'] }), ROLES.player);
    });

    it('reads the role from the roles array', function () {
      assert.equal(getUserRole({ roles: ['player'] }), ROLES.player);
      assert.equal(getUserRole({ roles: ['activePlayer'] }), ROLES.activePlayer);
      assert.equal(getUserRole({ roles: ['docsWriter', 'admin'] }), ROLES.admin);
    });

    it('applies the most permissive role when there are several', function () {
      assert.equal(getUserRole({ roles: ['admin', 'player'] }), ROLES.admin);
      assert.equal(getUserRole({ roles: ['player', 'activePlayer'] }), ROLES.activePlayer);
    });
  });

  describe('permissions', function () {
    it('limits players', function () {
      const permissions = getUserPermissions({});
      assert.equal(permissions.characterLimit, 2);
      assert.isFalse(permissions.canCreateLibraries);
      assert.equal(permissions.fileStorageLimit, 25_000_000);
      assert.isFalse(permissions.canManageRoles);
    });

    it('raises the character and storage limits for active players', function () {
      const permissions = getUserPermissions({ roles: ['activePlayer'] });
      assert.equal(permissions.characterLimit, 10);
      assert.isFalse(permissions.canCreateLibraries);
      assert.equal(permissions.fileStorageLimit, 100_000_000);
      assert.isFalse(permissions.canManageRoles);
    });

    it('lets admins alone create libraries and manage roles, with no character limit', function () {
      assert.deepEqual(ROLE_PERMISSIONS.admin, {
        characterLimit: Infinity,
        canCreateLibraries: true,
        fileStorageLimit: 100_000_000,
        canManageRoles: true,
      });
    });
  });

  describe('replaceRole', function () {
    it('keeps roles outside the hierarchy', function () {
      assert.deepEqual(replaceRole(['docsWriter', 'player'], ROLES.admin), ['docsWriter', 'admin']);
      assert.deepEqual(replaceRole(['admin', 'docsWriter'], ROLES.activePlayer), ['docsWriter', 'activePlayer']);
    });

    it('stores players without a role', function () {
      assert.deepEqual(replaceRole(['activePlayer', 'docsWriter'], ROLES.player), ['docsWriter']);
      assert.deepEqual(replaceRole(undefined, ROLES.player), []);
    });

    it('leaves a single role of the hierarchy', function () {
      assert.deepEqual(replaceRole(['player', 'activePlayer', 'admin'], ROLES.activePlayer), ['activePlayer']);
    });
  });

  describe('limit errors', function () {
    it('lets players own up to 2 characters', function () {
      assert.isUndefined(getCharacterLimitError({}, 0));
      assert.isUndefined(getCharacterLimitError({}, 1));
      assert.include(getCharacterLimitError({}, 2), 'active player');
      assert.isString(getCharacterLimitError({ roles: ['player'] }, 10));
    });

    it('lets active players own up to 10 characters', function () {
      const activePlayer = { roles: ['activePlayer'] };
      assert.isUndefined(getCharacterLimitError(activePlayer, 9));
      // Already an active player: the message does not suggest becoming one
      assert.notInclude(getCharacterLimitError(activePlayer, 10), 'active player');
    });

    it('lets admins own any number of characters', function () {
      assert.isUndefined(getCharacterLimitError({ roles: ['admin'] }, 1000));
    });

    it('only lets admins create libraries', function () {
      assert.isString(getLibraryCreationError({}));
      assert.isString(getLibraryCreationError({ roles: ['activePlayer'] }));
      assert.isUndefined(getLibraryCreationError({ roles: ['admin'] }));
    });

    it('limits the total size of a player\'s files to 25 MB', function () {
      assert.isUndefined(getFileStorageError({}, 25_000_000));
      assert.isUndefined(getFileStorageError({ fileStorageUsed: 20_000_000 }, 5_000_000));
      assert.isString(getFileStorageError({ fileStorageUsed: 20_000_000 }, 5_000_001));
      assert.isString(getFileStorageError({}, 25_000_001));
    });

    it('limits the total size of an active player\'s or admin\'s files to 100 MB', function () {
      for (const roles of [['activePlayer'], ['admin']]) {
        assert.isUndefined(getFileStorageError({ roles, fileStorageUsed: 90_000_000 }, 10_000_000));
        assert.isString(getFileStorageError({ roles, fileStorageUsed: 90_000_000 }, 10_000_001));
      }
    });

    it('refuses any file once a user is over their limit', function () {
      // A user moved back to player keeps the files they had
      assert.isString(getFileStorageError({ fileStorageUsed: 60_000_000 }, 1));
    });
  });
});

describe('Role permission assertions', function () {
  const playerId = Random.id();
  const activePlayerId = Random.id();
  const adminId = Random.id();
  const userIds = [playerId, activePlayerId, adminId];

  // Raw inserts: the user and creature schemas are not what is tested, so the
  // documents only hold the fields that matter here
  function addCharacters(owner: string, count: number, type = 'pc') {
    return Creatures.rawCollection().insertMany(Array.from({ length: count }, () => ({
      _id: Random.id(), owner, name: 'Role test character', type, readers: [], writers: [],
    })) as any[]);
  }

  beforeEach(async function () {
    await Meteor.users.removeAsync({ _id: { $in: userIds } });
    await Creatures.removeAsync({ owner: { $in: userIds } });
    await Meteor.users.rawCollection().insertMany([
      { _id: playerId, createdAt: new Date() },
      { _id: activePlayerId, createdAt: new Date(), roles: ['activePlayer'] },
      { _id: adminId, createdAt: new Date(), roles: ['admin'] },
    ] as any[]);
  });

  after(async function () {
    await Meteor.users.removeAsync({ _id: { $in: userIds } });
    await Creatures.removeAsync({ owner: { $in: userIds } });
  });

  async function assertRejects(promise: Promise<unknown>, message: string) {
    let error;
    try {
      await promise;
    } catch (e) {
      error = e;
    }
    assert.exists(error, message);
  }

  it('stops a player at 2 owned characters', async function () {
    await addCharacters(playerId, 1);
    await assertCanCreateCharacter(playerId);
    await addCharacters(playerId, 1);
    await assertRejects(assertCanCreateCharacter(playerId), 'a third character is refused');
  });

  it('only counts the characters the player owns', async function () {
    await addCharacters(playerId, 1);
    await addCharacters(activePlayerId, 5);
    await assertCanCreateCharacter(playerId);
  });

  it('only counts player characters: a game master\'s monsters and NPCs are not', async function () {
    await addCharacters(playerId, 1);
    await addCharacters(playerId, 30, 'monster');
    await addCharacters(playerId, 2, 'npc');
    await assertCanCreateCharacter(playerId);
    await addCharacters(playerId, 1);
    await assertRejects(assertCanCreateCharacter(playerId), 'a third player character is refused');
  });

  it('stops an active player at 10 owned characters', async function () {
    await addCharacters(activePlayerId, 9);
    await assertCanCreateCharacter(activePlayerId);
    await addCharacters(activePlayerId, 1);
    await assertRejects(assertCanCreateCharacter(activePlayerId), 'an eleventh character is refused');
  });

  it('lets admins create any number of characters', async function () {
    await addCharacters(adminId, 20);
    await assertCanCreateCharacter(adminId);
  });

  it('only lets admins create libraries', async function () {
    await assertRejects(assertCanCreateLibrary(playerId), 'players can\'t create libraries');
    await assertRejects(assertCanCreateLibrary(activePlayerId), 'active players can\'t create libraries');
    await assertCanCreateLibrary(adminId);
  });

  it('only lets admins manage roles', async function () {
    await assertRejects(assertCanManageRoles(playerId), 'players can\'t manage roles');
    await assertRejects(assertCanManageRoles(activePlayerId), 'active players can\'t manage roles');
    await assertCanManageRoles(adminId);
  });

  it('refuses users that are not logged in', async function () {
    await assertRejects(assertCanCreateCharacter(undefined), 'no user id');
    await assertRejects(assertCanCreateLibrary(null), 'no user id');
    await assertRejects(assertCanCreateLibrary(Random.id()), 'unknown user');
  });
});
