import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import searchUsers from '/imports/api/users/methods/searchUsers';

// The admin page's search: admins only, by id or part of a username or an
// email address, and nothing of an account but what the page shows
const tag = Random.id(6).toLowerCase();
const [adminId, playerId, foundId] = [Random.id(), Random.id(), Random.id()];
const search = (userId, text) => /** @type {any} */ (searchUsers)._execute({ userId }, { search: text });

describe('Search users', function () {
  before(async function () {
    if (!Meteor.isServer) this.skip();
    await Meteor.users.insertAsync({ _id: adminId, username: `admin-${tag}`, roles: ['admin'] });
    await Meteor.users.insertAsync({ _id: playerId, username: `player-${tag}`, roles: ['player'] });
    // Past the schema: an account as the accounts package writes it
    await Meteor.users.rawCollection().insertOne({
      _id: foundId,
      username: `Found.One-${tag}`,
      emails: [{ address: `found-${tag}@example.org`, verified: true }],
      roles: ['activePlayer'],
      fileStorageUsed: 1234,
      services: { password: { bcrypt: 'secret hash' }, resume: { loginTokens: [{ hashedToken: 'secret token' }] } },
    });
    for (const type of ['pc', 'pc', 'monster']) {
      await Creatures.rawCollection().insertOne(/** @type {any} */ ({ _id: Random.id(), name: tag, owner: foundId, type }));
    }
  });

  after(async function () {
    if (!Meteor.isServer) return;
    await Creatures.removeAsync({ owner: foundId });
    await Meteor.users.removeAsync({ _id: { $in: [adminId, playerId, foundId] } });
  });

  it('is for admins only', async function () {
    let error;
    try {
      await search(playerId, tag);
    } catch (e) {
      error = e;
    }
    assert.equal(/** @type {any} */ (error)?.error, 'Permission denied');
  });

  it('finds a user by id, part of their username or of their email address', async function () {
    for (const text of [foundId, `found.one-${tag}`, `found-${tag}@example`]) {
      assert.deepEqual((await search(adminId, text)).map(user => user._id), [foundId], text);
    }
  });

  it('reads the search as text, not as a pattern', async function () {
    // "." matches itself only: "Found.One" but not "FoundxOne"
    assert.deepEqual(await search(adminId, `Foundx One-${tag}`), []);
    assert.deepEqual(await search(adminId, `.*-${tag}`), []);
  });

  it('gives what the page shows, and never the account\'s secrets', async function () {
    const [found] = await search(adminId, `found-${tag}@`);
    assert.deepEqual(found, {
      _id: foundId,
      username: `Found.One-${tag}`,
      email: `found-${tag}@example.org`,
      role: 'activePlayer',
      // Monsters don't count towards a role's characters
      characterCount: 2,
      fileStorageUsed: 1234,
    });
  });
});
