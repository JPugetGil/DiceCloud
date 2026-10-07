import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import { getPartyRole } from '/imports/api/creature/creatureFolders/party';
import { MAX_BOARD_MONSTERS, boardError } from '/imports/api/creature/creatureFolders/boardMonsters';

/*
 * The monsters of a party board (boardMonsters.js), which its game master
 * alone adds and removes. The work is the server's: the libraries and the
 * dice are there, and the client has no copy of the board's monsters to
 * simulate with.
 */

// Adding a monster copies and computes a whole creature per copy
const rateLimit = { numRequests: 5, timeInterval: 10000 };

async function getFolderAsGm(folderId, userId) {
  const folder = userId && await CreatureFolders.findOneAsync(folderId);
  if (getPartyRole(folder, userId) !== 'gm') {
    throw boardError('monsters.denied', 'monsters.errors.denied');
  }
  return folder;
}

/**
 * Adds `count` copies of a monster of the game master's libraries to the
 * board: average hit points unless rolled, and into the fight if one is under
 * way, with one initiative roll for the group if asked. Returns their ids
 */
export const addBoardMonsters = new ValidatedMethod({
  name: 'creatureFolders.monsters.add',
  validate: new SimpleSchema({
    folderId: { type: String, max: 32 },
    // The monster: a library node of type 'creature'
    nodeId: { type: String, max: 32 },
    count: { type: SimpleSchema.Integer, min: 1, max: MAX_BOARD_MONSTERS, optional: true },
    rollHitPoints: { type: Boolean, optional: true },
    sharedInitiative: { type: Boolean, optional: true },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId, nodeId, count, rollHitPoints, sharedInitiative }) {
    const folder = await getFolderAsGm(folderId, this.userId);
    if (Meteor.isServer) {
      // Imported when called: the library collections and the folders'
      // methods import each other
      const { addMonstersToBoard } = await import('/imports/api/creature/creatureFolders/server/boardMonsters');
      return addMonstersToBoard({
        folder, userId: this.userId, nodeId, count, rollHitPoints, sharedInitiative,
      });
    }
  },
});

/**
 * The end of the encounter: the board's monsters are deleted, and the
 * combat ends with `endCombat`, as endInitiative ends it. Returns how many
 * monsters were deleted
 */
export const endEncounter = new ValidatedMethod({
  name: 'creatureFolders.monsters.endEncounter',
  validate: new SimpleSchema({
    folderId: { type: String, max: 32 },
    endCombat: { type: Boolean, optional: true },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId, endCombat }) {
    const folder = await getFolderAsGm(folderId, this.userId);
    if (Meteor.isServer) {
      const { removeBoardMonsters } = await import('/imports/api/creature/creatureFolders/server/boardMonsters');
      const removed = await removeBoardMonsters(folder);
      if (endCombat) {
        await CreatureFolders.updateAsync(folderId, { $unset: { initiative: 1, initiativeStats: 1 } });
      }
      return removed;
    }
  },
});

// The picker searches as the game master types
const searchRateLimit = { numRequests: 20, timeInterval: 5000 };

/** The bestiaries the user reads: libraries with monsters, their language and how many */
export const listBestiaries = new ValidatedMethod({
  name: 'creatureFolders.monsters.bestiaries',
  validate: null,
  mixins: [RateLimiterMixin],
  rateLimit: searchRateLimit,
  async run() {
    if (!this.userId) return [];
    if (Meteor.isServer) {
      const { listBestiaries } = await import('/imports/api/creature/creatureFolders/server/boardMonsters');
      return listBestiaries(this.userId);
    }
  },
});

/**
 * The monsters of some of the user's bestiaries, by name and tags (challenge
 * rating `cr-1/4`, size, type): `{ total, monsters }`
 */
export const searchMonsters = new ValidatedMethod({
  name: 'creatureFolders.monsters.search',
  validate: new SimpleSchema({
    libraryIds: { type: Array, maxCount: 50 },
    'libraryIds.$': { type: String, max: 32 },
    text: { type: String, optional: true, max: 64 },
    tags: { type: Array, optional: true, maxCount: 5 },
    'tags.$': { type: String, max: 32 },
    limit: { type: SimpleSchema.Integer, min: 1, max: 200, optional: true },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: searchRateLimit,
  async run({ libraryIds, text, tags, limit }) {
    if (!this.userId) return { total: 0, monsters: [] };
    if (Meteor.isServer) {
      const { searchMonsters } = await import('/imports/api/creature/creatureFolders/server/boardMonsters');
      return searchMonsters(this.userId, { libraryIds, text, tags, limit });
    }
  },
});
