import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { getPartyRole, partyCreaturesFilter } from '/imports/api/creature/creatureFolders/party';
import {
  createPartyInvite, revokePartyInvite, getPartyInvite, joinParty, setMyPartyCharacters,
  leaveParty, removePartyMember,
} from '/imports/api/creature/creatureFolders/methods/partyMethods';
import { updateInitiativeEntry } from '/imports/api/creature/creatureFolders/methods/initiativeMethods';

describe('Parties', function () {
  const [gmId, playerId, otherPlayerId, strangerId] = [Random.id(), Random.id(), Random.id(), Random.id()];
  const userIds = [gmId, playerId, otherPlayerId, strangerId];
  const folderId = Random.id();
  const [gmNpc, hero, sidekick, otherHero, strangersCharacter] =
    [Random.id(), Random.id(), Random.id(), Random.id(), Random.id()];
  const creatureIds = [gmNpc, hero, sidekick, otherHero, strangersCharacter];
  const as = (method, userId: string, args: object) => method._execute({ userId }, args);
  const folder = () => CreatureFolders.findOneAsync(folderId);
  const creature = (id: string) => Creatures.findOneAsync(id);

  async function assertRefused(promise: Promise<unknown>, message: string) {
    let error;
    try {
      await promise;
    } catch (e) {
      error = e;
    }
    assert.exists(error, message);
  }

  async function removeAll() {
    await CreatureFolders.removeAsync(folderId);
    await Creatures.removeAsync({ _id: { $in: creatureIds } });
    await Meteor.users.removeAsync({ _id: { $in: userIds } });
  }

  beforeEach(async function () {
    if (!Meteor.isServer) this.skip();
    await removeAll();
    await Meteor.users.rawCollection().insertMany(userIds.map((_id, i) => ({
      _id, createdAt: new Date(), username: `party-test-${i}-${_id}`,
    })) as any[]);
    const character = (_id: string, owner: string) => ({
      _id, owner, name: `Character ${_id}`, type: 'pc', readers: [], writers: [], public: false,
    });
    await Creatures.rawCollection().insertMany([
      character(gmNpc, gmId),
      // The game master already reads the hero: joining makes them its writer
      { ...character(hero, playerId), readers: [gmId] },
      character(sidekick, playerId),
      character(otherHero, otherPlayerId),
      character(strangersCharacter, strangerId),
    ] as any[]);
    await CreatureFolders.rawCollection().insertOne({
      _id: folderId, name: 'The table', owner: gmId, creatures: [gmNpc], members: [], order: 0,
    } as any);
  });

  after(async function () {
    if (!Meteor.isServer) return;
    await removeAll();
  });

  async function invite() {
    return as(createPartyInvite, gmId, { folderId });
  }

  it('gives the game master and the players their role', async function () {
    const party = { _id: folderId, owner: gmId, members: [playerId] };
    assert.equal(getPartyRole(party, gmId), 'gm');
    assert.equal(getPartyRole(party, playerId), 'member');
    assert.isUndefined(getPartyRole(party, strangerId));
    assert.isUndefined(getPartyRole(party, undefined));
  });

  it('only lets the game master invite, and revoke the link', async function () {
    await assertRefused(as(createPartyInvite, playerId, { folderId }), 'a player can\'t invite');
    const token = await invite();
    assert.isString(token);
    assert.equal((await folder())?.inviteToken, token);

    const preview = await as(getPartyInvite, strangerId, { token });
    assert.equal(preview.name, 'The table');
    assert.equal(preview.folderId, folderId);
    assert.isUndefined(preview.role);

    await as(revokePartyInvite, gmId, { folderId });
    await assertRefused(as(getPartyInvite, strangerId, { token }), 'a revoked link leads nowhere');
    await assertRefused(as(joinParty, strangerId, { token, creatureIds: [] }), 'nor lets anyone join');
  });

  it('joins with the player\'s own characters, which the game master may then edit', async function () {
    const token = await invite();
    await assertRefused(as(joinParty, playerId, { token, creatureIds: [hero, otherHero] }),
      'someone else\'s character');
    assert.notInclude((await folder())?.members || [], playerId, 'nothing changes on a refusal');

    assert.equal(await as(joinParty, playerId, { token, creatureIds: [hero] }), folderId);
    const party = await folder();
    assert.include(party?.members, playerId);
    assert.sameMembers(party?.creatures || [], [gmNpc, hero]);
    assert.include((await creature(hero))?.writers, gmId);
    assert.notInclude((await creature(hero))?.readers, gmId);

    // Joining again brings more characters
    await as(joinParty, playerId, { token, creatureIds: [sidekick] });
    assert.sameMembers((await folder())?.creatures || [], [gmNpc, hero, sidekick]);
    assert.lengthOf((await folder())?.members || [], 1);

    await assertRefused(as(joinParty, gmId, { token, creatureIds: [] }), 'the game master can\'t join');
  });

  it('shows members the party\'s characters, never those of someone outside it', async function () {
    const token = await invite();
    await as(joinParty, playerId, { token, creatureIds: [hero] });
    await as(joinParty, otherPlayerId, { token, creatureIds: [otherHero] });
    // The game master's folder can hold anything: a stranger's character too
    await CreatureFolders.updateAsync(folderId, { $addToSet: { creatures: strangersCharacter } });
    const party = await folder();
    const seenBy = async (userId: string) => Creatures.find(partyCreaturesFilter(party as any, userId))
      .mapAsync(found => found._id);

    assert.sameMembers(await seenBy(playerId), [gmNpc, hero, otherHero],
      'the other player\'s character is not shared with them, but it is in the party');
    assert.sameMembers(await seenBy(gmId), [gmNpc, hero, otherHero],
      'the game master sees what is shared with them');
  });

  it('lets a member set which of their characters are in the party', async function () {
    const token = await invite();
    await as(joinParty, playerId, { token, creatureIds: [hero] });
    await as(setMyPartyCharacters, playerId, { folderId, creatureIds: [sidekick] });
    assert.sameMembers((await folder())?.creatures || [], [gmNpc, sidekick]);
    assert.notInclude((await creature(hero))?.writers, gmId, 'the game master no longer edits it');
    assert.include((await creature(sidekick))?.writers, gmId);
    await assertRefused(as(setMyPartyCharacters, strangerId, { folderId, creatureIds: [strangersCharacter] }),
      'only members');
  });

  it('takes the characters out, initiative included, when a player leaves or is removed', async function () {
    const token = await invite();
    await as(joinParty, playerId, { token, creatureIds: [hero] });
    await as(joinParty, otherPlayerId, { token, creatureIds: [otherHero] });
    await CreatureFolders.updateAsync(folderId, {
      $set: {
        initiative: {
          round: 1,
          // The other hero (15) acts after the hero (18): it is the other hero's turn
          turn: 1,
          entries: [
            { _id: 'entry-hero', creatureId: hero, name: 'Hero', initiative: 18, bonus: 0 },
            { _id: 'entry-other', creatureId: otherHero, name: 'Other', initiative: 15, bonus: 0 },
            { _id: 'entry-goblin', name: 'Goblin', initiative: 5, bonus: 0 },
          ],
        },
      },
    });

    await as(leaveParty, playerId, { folderId });
    let party = await folder();
    assert.notInclude(party?.members, playerId);
    assert.notInclude(party?.creatures, hero);
    assert.notInclude((await creature(hero))?.writers, gmId);
    assert.sameMembers(party?.initiative?.entries?.map(entry => entry._id) || [], ['entry-other', 'entry-goblin']);
    assert.equal(party?.initiative?.turn, 0, 'still the other hero\'s turn');

    await assertRefused(as(removePartyMember, playerId, { folderId, userId: otherPlayerId }),
      'only the game master removes players');
    await as(removePartyMember, gmId, { folderId, userId: otherPlayerId });
    party = await folder();
    assert.isEmpty(party?.members);
    assert.sameMembers(party?.creatures || [], [gmNpc]);
  });

  it('lets players type their own characters\' initiative, and nothing else', async function () {
    const token = await invite();
    await as(joinParty, playerId, { token, creatureIds: [hero] });
    await as(joinParty, otherPlayerId, { token, creatureIds: [otherHero] });
    await CreatureFolders.updateAsync(folderId, {
      $set: {
        initiative: {
          round: 1, turn: 0, entries: [
            { _id: 'entry-hero', creatureId: hero, name: 'Hero', initiative: 3, bonus: 0, roll: 3 },
            { _id: 'entry-other', creatureId: otherHero, name: 'Other', initiative: 4, bonus: 0 },
          ],
        },
      },
    });
    await as(updateInitiativeEntry, playerId, { folderId, entryId: 'entry-hero', initiative: 17 });
    const entries = (await folder())?.initiative?.entries || [];
    assert.equal(entries.find(entry => entry._id === 'entry-hero')?.initiative, 17);

    await assertRefused(as(updateInitiativeEntry, playerId, { folderId, entryId: 'entry-other', initiative: 1 }),
      'another player\'s character');
    await assertRefused(as(updateInitiativeEntry, playerId, { folderId, entryId: 'entry-hero', bonus: 5 }),
      'the bonus is the game master\'s');
    await assertRefused(as(updateInitiativeEntry, strangerId, { folderId, entryId: 'entry-hero', initiative: 1 }),
      'someone outside the party');
    await as(updateInitiativeEntry, gmId, { folderId, entryId: 'entry-other', initiative: 12, bonus: 2 });
  });
});
