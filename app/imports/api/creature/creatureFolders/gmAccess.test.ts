import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import removeCreatureFolder from '/imports/api/creature/creatureFolders/methods/removeCreatureFolder';
import moveCreatureToFolder from '/imports/api/creature/creatureFolders/methods/moveCreatureToFolder';
import { removeCharacters } from '/imports/api/creature/creatureFolders/removeFromFolders';

/*
 * A player's character joins a party: its game master becomes one of its
 * writers. That access is the party's: it ends with the character's place in
 * it, however that ends (the player leaves, the game master deletes the
 * folder or files the character elsewhere), unless another of the game
 * master's parties still holds the character.
 */
const as = (method: unknown, userId: string, args: unknown) =>
  (method as { _execute(invocation: { userId: string }, args: unknown): Promise<unknown> })._execute({ userId }, args);

if (Meteor.isServer) describe('A game master\'s access to a party\'s characters', function () {
  const [gmId, playerId] = [Random.id(), Random.id()];
  let characterId: string;
  let folderIds: string[];

  const party = async (name: string) => {
    const _id = await CreatureFolders.insertAsync({
      owner: gmId, name, members: [playerId], creatures: [characterId],
    } as any);
    folderIds.push(_id);
    return _id;
  };
  const writers = async () => (await Creatures.findOneAsync(characterId))?.writers || [];

  beforeEach(async function () {
    folderIds = [];
    await Meteor.users.rawCollection().insertMany([gmId, playerId].map(_id => ({
      _id, username: `gm-access-${_id}`, createdAt: new Date(),
    })) as any[]);
    characterId = await Creatures.insertAsync({ owner: playerId, name: 'Hero', type: 'pc', writers: [gmId] } as any);
  });

  afterEach(async function () {
    await Meteor.users.removeAsync({ _id: { $in: [gmId, playerId] } });
    await Creatures.removeAsync(characterId);
    await CreatureFolders.removeAsync({ _id: { $in: folderIds } });
  });

  it('ends when the game master deletes the party', async function () {
    const folderId = await party('Table');
    await as(removeCreatureFolder, gmId, { _id: folderId });
    assert.notInclude(await writers(), gmId);
  });

  it('ends when the game master files the character elsewhere', async function () {
    const folderId = await party('Table');
    const otherId = await CreatureFolders.insertAsync({ owner: gmId, name: 'Shelf', creatures: [] } as any);
    folderIds.push(otherId);
    await as(moveCreatureToFolder, gmId, { creatureId: characterId, folderId: otherId });
    assert.notInclude((await CreatureFolders.findOneAsync(folderId))?.creatures, characterId);
    assert.notInclude(await writers(), gmId);
  });

  it('stays while another of the game master\'s parties holds the character', async function () {
    const tableId = await party('Table');
    await party('Other table');
    await removeCharacters(await CreatureFolders.findOneAsync(tableId), [characterId]);
    assert.include(await writers(), gmId, 'still the other party\'s game master');
  });
});
