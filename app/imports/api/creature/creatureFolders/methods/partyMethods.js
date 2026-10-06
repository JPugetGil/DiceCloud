import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import CreatureFolders, { MAX_PARTY_MEMBERS } from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { getPartyRole } from '/imports/api/creature/creatureFolders/party';
import { removeCharacters } from '/imports/api/creature/creatureFolders/removeFromFolders';

/*
 * Parties: a game master invites players to their folder's party board with a
 * link. A player joins with some of their characters, which the game master
 * may then edit (give experience, rest, apply damage). Leaving the party, or
 * being removed from it, takes the characters out and that access back.
 */

const rateLimit = { numRequests: 5, timeInterval: 5000 };

// How many of their characters a player brings to a party
export const MAX_PARTY_CHARACTERS = 10;

/**
 * @param {string | null | undefined} userId
 * @returns {asserts userId is string}
 */
function assertLoggedIn(userId) {
  if (!userId) {
    throw new Meteor.Error('party.denied', 'You need to be logged in');
  }
}

async function getFolderAsGm(folderId, userId) {
  assertLoggedIn(userId);
  const folder = await CreatureFolders.findOneAsync(folderId);
  if (getPartyRole(folder, userId) !== 'gm') {
    throw new Meteor.Error('party.denied', 'Only the game master of this party can do this');
  }
  return folder;
}

async function getFolderByToken(token) {
  const folder = token && await CreatureFolders.findOneAsync({ inviteToken: token });
  if (!folder) {
    throw new Meteor.Error('party.invite-not-found', 'This invitation link is no longer valid');
  }
  return folder;
}

// The user's own characters among `creatureIds`, refusing any other
async function getOwnCharacterIds(creatureIds, userId) {
  const owned = await Creatures.find(
    { _id: { $in: creatureIds }, owner: userId }, { fields: { _id: 1 } },
  ).mapAsync(creature => creature._id);
  if (owned.length !== new Set(creatureIds).size) {
    throw new Meteor.Error('party.denied', 'You can only bring your own characters to a party');
  }
  return owned;
}

async function memberCharacterIds(folder, userId) {
  return Creatures.find(
    { _id: { $in: folder.creatures || [] }, owner: userId }, { fields: { _id: 1 } },
  ).mapAsync(creature => creature._id);
}

const folderIdSchema = { folderId: { type: String, max: 32 } };
const creatureIdsSchema = {
  creatureIds: { type: Array, maxCount: MAX_PARTY_CHARACTERS, defaultValue: [] },
  'creatureIds.$': { type: String, max: 32 },
};

/** Creates the party's invitation link, or a new one that replaces it. Returns its token */
export const createPartyInvite = new ValidatedMethod({
  name: 'creatureFolders.party.createInvite',
  validate: new SimpleSchema(folderIdSchema).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId }) {
    await getFolderAsGm(folderId, this.userId);
    if (Meteor.isClient) return;
    const inviteToken = Random.secret(24);
    await CreatureFolders.updateAsync(folderId, { $set: { inviteToken } });
    return inviteToken;
  },
});

/** Turns the invitation link off: the players who joined stay */
export const revokePartyInvite = new ValidatedMethod({
  name: 'creatureFolders.party.revokeInvite',
  validate: new SimpleSchema(folderIdSchema).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId }) {
    await getFolderAsGm(folderId, this.userId);
    await CreatureFolders.updateAsync(folderId, { $unset: { inviteToken: 1 } });
  },
});

/** What an invitation link leads to, for its page */
export const getPartyInvite = new ValidatedMethod({
  name: 'creatureFolders.party.getInvite',
  validate: new SimpleSchema({ token: { type: String, max: 32 } }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ token }) {
    assertLoggedIn(this.userId);
    if (Meteor.isClient) return;
    const folder = await getFolderByToken(token);
    const gm = await Meteor.users.findOneAsync(folder.owner, { fields: { username: 1 } });
    return {
      folderId: folder._id,
      name: folder.name,
      gmName: gm?.username,
      memberCount: folder.members?.length || 0,
      role: getPartyRole(folder, this.userId),
    };
  },
});

/**
 * Joins the party of an invitation link with some of the user's characters,
 * which the game master may then edit. A member can join again to bring more.
 */
export const joinParty = new ValidatedMethod({
  name: 'creatureFolders.party.join',
  validate: new SimpleSchema({
    token: { type: String, max: 32 },
    ...creatureIdsSchema,
  }).validator({ clean: true }),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ token, creatureIds = [] }) {
    const userId = this.userId;
    assertLoggedIn(userId);
    if (Meteor.isClient) return;
    const folder = await getFolderByToken(token);
    const role = getPartyRole(folder, userId);
    if (role === 'gm') {
      throw new Meteor.Error('party.denied', 'You are the game master of this party');
    }
    if (!role && (folder.members?.length || 0) >= MAX_PARTY_MEMBERS) {
      throw new Meteor.Error('party.full', `A party has up to ${MAX_PARTY_MEMBERS} players`);
    }
    const ownIds = await getOwnCharacterIds(creatureIds, userId);
    const alreadyIn = await memberCharacterIds(folder, userId);
    if (new Set([...alreadyIn, ...ownIds]).size > MAX_PARTY_CHARACTERS) {
      throw new Meteor.Error('party.denied',
        `You can bring up to ${MAX_PARTY_CHARACTERS} characters to a party`);
    }
    if (ownIds.length) {
      // The game master edits the characters: as writer, not reader
      await Creatures.updateAsync(
        { _id: { $in: ownIds } },
        { $addToSet: { writers: folder.owner }, $pull: { readers: folder.owner } },
        { multi: true },
      );
    }
    await CreatureFolders.updateAsync(folder._id, {
      $addToSet: { members: userId, creatures: { $each: ownIds } },
    });
    return folder._id;
  },
});

/** Sets which of their characters a member brings to the party */
export const setMyPartyCharacters = new ValidatedMethod({
  name: 'creatureFolders.party.setMyCharacters',
  validate: new SimpleSchema({ ...folderIdSchema, ...creatureIdsSchema }).validator({ clean: true }),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId, creatureIds = [] }) {
    const userId = this.userId;
    assertLoggedIn(userId);
    if (Meteor.isClient) return;
    const folder = await CreatureFolders.findOneAsync(folderId);
    if (!folder || getPartyRole(folder, userId) !== 'member') {
      throw new Meteor.Error('party.denied', 'You are not a player of this party');
    }
    const ownIds = await getOwnCharacterIds(creatureIds, userId);
    const alreadyIn = await memberCharacterIds(folder, userId);
    await removeCharacters(folder, alreadyIn.filter(id => !ownIds.includes(id)));
    const added = ownIds.filter(id => !alreadyIn.includes(id));
    if (added.length) {
      await Creatures.updateAsync(
        { _id: { $in: added } },
        { $addToSet: { writers: folder.owner }, $pull: { readers: folder.owner } },
        { multi: true },
      );
      await CreatureFolders.updateAsync(folderId, { $addToSet: { creatures: { $each: added } } });
    }
  },
});

/** A member leaves the party, with their characters */
export const leaveParty = new ValidatedMethod({
  name: 'creatureFolders.party.leave',
  validate: new SimpleSchema(folderIdSchema).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId }) {
    const userId = this.userId;
    assertLoggedIn(userId);
    if (Meteor.isClient) return;
    const folder = await CreatureFolders.findOneAsync(folderId);
    if (!folder || getPartyRole(folder, userId) !== 'member') return;
    await removeCharacters(folder, await memberCharacterIds(folder, userId));
    // any: Meteor's modifier types refuse a typed value in $pull on an untyped collection
    await CreatureFolders.updateAsync(folderId, { $pull: { members: /** @type {any} */ (userId) } });
  },
});

/** The game master removes a player from the party, with their characters */
export const removePartyMember = new ValidatedMethod({
  name: 'creatureFolders.party.removeMember',
  validate: new SimpleSchema({ ...folderIdSchema, userId: { type: String, max: 32 } }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId, userId }) {
    const folder = await getFolderAsGm(folderId, this.userId);
    if (Meteor.isClient) return;
    if (getPartyRole(folder, userId) !== 'member') return;
    await removeCharacters(folder, await memberCharacterIds(folder, userId));
    await CreatureFolders.updateAsync(folderId, { $pull: { members: userId } });
  },
});
