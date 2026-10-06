import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
// Not Users.js: attaching its schema here would make every suite's test users
// need its required fields
import '/imports/api/users/methods/deleteMyAccount';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import CreatureLogs from '/imports/api/creature/log/CreatureLogs';
import Libraries from '/imports/api/library/Libraries';
import LibraryCollections from '/imports/api/library/LibraryCollections';
import EngineActions from '/imports/api/engine/action/EngineActions';
import removeCreature from '/imports/api/creature/creatures/methods/removeCreature';

// What deleting an account, or a character, leaves behind in other users'
// documents: nothing that names the deleted user or their characters
if (Meteor.isServer) describe('Deleting an account or a character', function () {
  const [gmId, playerId, otherId] = [Random.id(), Random.id(), Random.id()];
  const [gmFighterId, playerBardId, playerRogueId] = [Random.id(), Random.id(), Random.id()];
  const [partyId, otherBoardId, libraryId, collectionId] = [Random.id(), Random.id(), Random.id(), Random.id()];
  const raw = collection => collection.rawCollection();
  // As the methods' server side runs for a user (as other suites do)
  const execute = (method, userId, args = {}) => method._execute({ userId, unblock() {} }, args);

  const creature = (_id, name, owner, extra = {}) => raw(Creatures).insertOne({
    _id, name, owner, readers: [], writers: [], type: 'pc', ...extra,
  });

  before(async function () {
    for (const _id of [gmId, playerId, otherId]) {
      await raw(Meteor.users).insertOne({ _id, username: `test-${_id}` });
    }
    // The game master's fighter, shared with the player; the player's bard,
    // which the game master may edit since the player joined the party
    await creature(gmFighterId, 'Fighter', gmId, { readers: [playerId] });
    await creature(playerBardId, 'Bard', playerId, { writers: [gmId] });
    // In the middle of a fight: the fighter's turn, after the bard
    await raw(CreatureFolders).insertOne({
      _id: partyId, name: 'Party', owner: gmId, order: 0,
      members: [playerId, otherId], creatures: [playerBardId, gmFighterId],
      initiative: {
        round: 1,
        turn: 1,
        entries: [
          { _id: 'bard', creatureId: playerBardId, name: 'Bard', initiative: 15, bonus: 2 },
          { _id: 'fighter', creatureId: gmFighterId, name: 'Fighter', initiative: 10, bonus: 1 },
          { _id: 'goblin', name: 'Goblin', initiative: 5, bonus: 2 },
        ],
      },
    });
    await raw(Libraries).insertOne({
      _id: libraryId, name: 'Shared library', owner: gmId, readers: [playerId], writers: [],
    });
    await raw(LibraryCollections).insertOne({
      _id: collectionId, name: 'Shared collection', owner: gmId,
      readers: [playerId], writers: [playerId], libraries: [libraryId],
    });
    await raw(CreatureLogs).insertOne({ _id: Random.id(), creatureId: playerBardId, content: [] });
    await raw(EngineActions).insertOne({ _id: Random.id(), creatureId: playerBardId, results: [] });
  });

  after(async function () {
    await Meteor.users.removeAsync({ _id: { $in: [gmId, playerId, otherId] } });
    await raw(Creatures).deleteMany({ _id: { $in: [gmFighterId, playerBardId, playerRogueId] } });
    await raw(CreatureFolders).deleteMany({ _id: { $in: [partyId, otherBoardId] } });
    await raw(Libraries).deleteOne({ _id: libraryId });
    await raw(LibraryCollections).deleteOne({ _id: collectionId });
  });

  it('takes a deleted character off another game master\'s board', async function () {
    await creature(playerRogueId, 'Rogue', playerId, { writers: [otherId] });
    await raw(CreatureFolders).insertOne({
      _id: otherBoardId, name: 'Other board', owner: otherId, order: 0, members: [playerId],
      creatures: [playerRogueId],
      initiative: { round: 1, turn: 0, entries: [{ _id: 'rogue', creatureId: playerRogueId, name: 'Rogue', initiative: 12 }] },
    });
    await execute(removeCreature, playerId, { charId: playerRogueId });
    const board = await raw(CreatureFolders).findOne({ _id: otherBoardId });
    assert.deepEqual(board.creatures, []);
    assert.deepEqual(board.initiative.entries, []);
    assert.include(board.members, playerId, 'deleting a character keeps its owner in the party');
  });

  it('leaves no trace of the deleted user or their characters in other users\' documents', async function () {
    await execute(/** @type {any} */ (Meteor.users).deleteMyAccount, playerId);

    assert.isUndefined(await Meteor.users.findOneAsync(playerId));
    assert.isNull(await raw(Creatures).findOne({ _id: playerBardId }));

    const party = await raw(CreatureFolders).findOne({ _id: partyId });
    assert.deepEqual(party.members, [otherId]);
    assert.deepEqual(party.creatures, [gmFighterId]);
    assert.deepEqual(party.initiative.entries.map(entry => entry._id), ['fighter', 'goblin']);
    assert.equal(party.initiative.turn, 0, 'still the fighter\'s turn');

    assert.notInclude((await raw(Creatures).findOne({ _id: gmFighterId })).readers, playerId);
    assert.notInclude((await raw(Libraries).findOne({ _id: libraryId })).readers, playerId);
    const collection = await raw(LibraryCollections).findOne({ _id: collectionId });
    assert.notInclude(collection.readers, playerId);
    assert.notInclude(collection.writers, playerId);

    assert.equal(await raw(CreatureLogs).countDocuments({ creatureId: playerBardId }), 0);
    assert.equal(await raw(EngineActions).countDocuments({ creatureId: playerBardId }), 0);

    // Nothing anywhere still names them or their characters
    const documents = [
      ...await raw(Creatures).find({ _id: { $in: [gmFighterId] } }).toArray(),
      ...await raw(CreatureFolders).find({ _id: { $in: [partyId, otherBoardId] } }).toArray(),
      await raw(Libraries).findOne({ _id: libraryId }),
      collection,
    ];
    for (const id of [playerId, playerBardId, playerRogueId]) {
      assert.notInclude(JSON.stringify(documents), id);
    }
  });
});
