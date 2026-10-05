import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import initiativeOrder, { turnAfterChange } from '/imports/api/creature/creatureFolders/initiativeOrder';
import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';
import { getPartyRole } from '/imports/api/creature/creatureFolders/party';
import {
  MAX_COUNT, entryStatus, numberedNames, damageAfter,
} from '/imports/api/creature/creatureFolders/initiativeCreatures';

/*
 * The initiative tracker of a party board, stored on its character folder.
 * The folder's owner, the game master, runs it; the players of the party only
 * type their own characters' results.
 */

const rateLimit = { numRequests: 10, timeInterval: 5000 };

let startCreatureTurn;
if (Meteor.isServer) {
  // require(), not import: the server alone counts durations down
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ({ startCreatureTurn } = require('/imports/api/creature/creatureFolders/server/startCreatureTurn'));
}

/**
 * The turn of the entry at `turn` starts: its creature's effects count a
 * round down, unless the game master turned that off for the party
 */
async function startTurn(folder, entries, turn, userId) {
  if (!Meteor.isServer || folder.trackDurations === false) return;
  const entry = initiativeOrder(entries)[turn];
  if (!entry?.creatureId) return;
  try {
    await startCreatureTurn(entry.creatureId, userId);
  } catch (error) {
    // The turn still moves on
    console.error(error);
  }
}

async function getOwnFolder(folderId, userId) {
  if (!userId) {
    throw new Meteor.Error('initiative.denied', 'You need to be logged in to track initiative');
  }
  const folder = await CreatureFolders.findOneAsync(folderId);
  if (!folder || folder.owner !== userId) {
    throw new Meteor.Error('initiative.denied', 'This folder does not belong to you');
  }
  return folder;
}

const rollD20 = () => Math.floor(Random.fraction() * 20) + 1;

// A character's initiative bonus: its initiative stat, else its Dexterity modifier
async function initiativeBonus(creatureId) {
  const active = { 'root.id': creatureId, removed: { $ne: true }, inactive: { $ne: true }, overridden: { $ne: true } };
  const initiative = await CreatureProperties.findOneAsync({ ...active, variableName: 'initiative' });
  if (Number.isFinite(initiative?.value)) return initiative.value;
  const dexterity = await CreatureProperties.findOneAsync({ ...active, variableName: 'dexterity' });
  return Number.isFinite(dexterity?.modifier) ? dexterity.modifier : 0;
}

function rolled(entry) {
  const roll = rollD20();
  return { ...entry, roll, initiative: roll + (entry.bonus || 0) };
}

/**
 * Rolls for the folder's characters (those its owner can view), and for the
 * creatures added by hand that have no result yet, then starts round 1
 */
export const rollInitiative = new ValidatedMethod({
  name: 'creatureFolders.initiative.roll',
  validate: new SimpleSchema({ folderId: { type: String, max: 32 } }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId }) {
    const folder = await getOwnFolder(folderId, this.userId);
    // The dice are the server's: the client waits for its result
    if (Meteor.isClient) return;
    const userId = this.userId;
    const creatures = await Creatures.find({
      _id: { $in: folder.creatures || [] },
      $or: [{ owner: userId }, { readers: userId }, { writers: userId }, { public: true }],
    }, { fields: { name: 1 } }).fetchAsync();
    const previous = folder.initiative?.entries || [];
    const entries = [];
    for (const creature of creatures) {
      const existing = previous.find(entry => entry.creatureId === creature._id);
      entries.push(rolled({
        _id: existing?._id || Random.id(),
        creatureId: creature._id,
        name: creature.name,
        bonus: await initiativeBonus(creature._id),
      }));
    }
    for (const entry of previous) {
      if (entry.creatureId) continue;
      entries.push(Number.isFinite(entry.initiative) ? entry : rolled(entry));
    }
    await CreatureFolders.updateAsync(folderId, {
      $set: {
        initiative: {
          round: 1, turn: 0, entries,
          ...folder.initiative?.showStats && { showStats: true },
        },
      },
    });
    await startTurn(folder, entries, 0, userId);
  },
});

/**
 * Adds creatures by hand (UX11): `count` of them, numbered ("Goblin ×4" makes
 * Goblin 1 to 4), each rolled from its bonus unless given a result, with hit
 * points and armor class if given, which only the game master sees
 */
export const addInitiativeEntry = new ValidatedMethod({
  name: 'creatureFolders.initiative.add',
  validate: new SimpleSchema({
    folderId: { type: String, max: 32 },
    name: { type: String, max: STORAGE_LIMITS.name },
    bonus: { type: Number, optional: true },
    initiative: { type: Number, optional: true },
    count: { type: SimpleSchema.Integer, min: 1, max: MAX_COUNT, optional: true },
    hp: { type: SimpleSchema.Integer, min: 1, max: 99999, optional: true },
    ac: { type: SimpleSchema.Integer, min: 0, max: 99, optional: true },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId, name, bonus, initiative, count = 1, hp, ac }) {
    const folder = await getOwnFolder(folderId, this.userId);
    if (Meteor.isClient) return;
    const tracker = folder.initiative || { round: 0, turn: 0, entries: [] };
    const names = numberedNames(name, count, (tracker.entries || []).map(entry => entry.name));
    const $set = {};
    const added = names.map(entryName => {
      let entry = { _id: Random.id(), name: entryName, bonus: bonus || 0 };
      entry = Number.isFinite(initiative) ? { ...entry, initiative } : rolled(entry);
      if (hp || Number.isFinite(ac)) {
        const stats = { ...hp && { hp, damage: 0 }, ...Number.isFinite(ac) && { ac } };
        $set[`initiativeStats.${entry._id}`] = stats;
        const status = entryStatus(stats);
        if (status) entry.status = status;
      }
      return entry;
    });
    const entries = [...(tracker.entries || []), ...added];
    // The creature whose turn it is keeps it, though the newcomers may come first
    const turn = turnAfterChange(tracker.entries, tracker.turn || 0, entries);
    await CreatureFolders.updateAsync(folderId, {
      $set: { ...$set, initiative: { ...tracker, entries, turn } },
    });
  },
});

/**
 * Damage (or healing, when negative) to a creature added by hand: its status
 * follows, which is what the players see
 */
export const damageInitiativeEntry = new ValidatedMethod({
  name: 'creatureFolders.initiative.damage',
  validate: new SimpleSchema({
    folderId: { type: String, max: 32 },
    entryId: { type: String, max: 32 },
    amount: { type: SimpleSchema.Integer, min: -99999, max: 99999 },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId, entryId, amount }) {
    const folder = await getOwnFolder(folderId, this.userId);
    const entry = folder.initiative?.entries?.find(entry => entry._id === entryId);
    if (!entry || entry.creatureId) {
      throw new Meteor.Error('initiative.not-found', 'Only creatures added by hand take damage here');
    }
    const stats = folder.initiativeStats?.[entryId] || {};
    const updated = { ...stats, damage: damageAfter(stats, amount) };
    const status = entryStatus(updated, entry.out);
    await CreatureFolders.updateAsync({ _id: folderId, 'initiative.entries._id': entryId }, {
      $set: { [`initiativeStats.${entryId}`]: updated, ...status && { 'initiative.entries.$.status': status } },
      ...!status && { $unset: { 'initiative.entries.$.status': 1 } },
    });
  },
});

/** Puts a creature added by hand out of the fight, or back in: its turns are skipped while out */
export const setInitiativeEntryOut = new ValidatedMethod({
  name: 'creatureFolders.initiative.setOut',
  validate: new SimpleSchema({
    folderId: { type: String, max: 32 },
    entryId: { type: String, max: 32 },
    out: { type: Boolean },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId, entryId, out }) {
    const folder = await getOwnFolder(folderId, this.userId);
    const entry = folder.initiative?.entries?.find(entry => entry._id === entryId);
    if (!entry || entry.creatureId) {
      throw new Meteor.Error('initiative.not-found', 'Only creatures added by hand are put out of the fight here');
    }
    const status = entryStatus(folder.initiativeStats?.[entryId], out);
    const $set = { 'initiative.entries.$.out': out };
    if (status) $set['initiative.entries.$.status'] = status;
    await CreatureFolders.updateAsync({ _id: folderId, 'initiative.entries._id': entryId }, {
      $set,
      ...!status && { $unset: { 'initiative.entries.$.status': 1 } },
    });
  },
});

/** Shows the players the creatures' hit points and armor class, or hides them again */
export const setInitiativeShowStats = new ValidatedMethod({
  name: 'creatureFolders.initiative.setShowStats',
  validate: new SimpleSchema({
    folderId: { type: String, max: 32 },
    showStats: { type: Boolean },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId, showStats }) {
    const folder = await getOwnFolder(folderId, this.userId);
    if (!folder.initiative) return;
    await CreatureFolders.updateAsync(folderId, showStats
      ? { $set: { 'initiative.showStats': true } }
      : { $unset: { 'initiative.showStats': 1 } });
  },
});

/** Changes an entry's result (a player's own roll) or bonus */
export const updateInitiativeEntry = new ValidatedMethod({
  name: 'creatureFolders.initiative.update',
  validate: new SimpleSchema({
    folderId: { type: String, max: 32 },
    entryId: { type: String, max: 32 },
    initiative: { type: Number, optional: true },
    bonus: { type: Number, optional: true },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId, entryId, initiative, bonus }) {
    if (!this.userId) {
      throw new Meteor.Error('initiative.denied', 'You need to be logged in to track initiative');
    }
    const folder = await CreatureFolders.findOneAsync(folderId);
    const role = getPartyRole(folder, this.userId);
    if (role !== 'gm') {
      const entry = folder?.initiative?.entries?.find(entry => entry._id === entryId);
      const ownCharacter = role === 'member' && entry?.creatureId && await Creatures.findOneAsync(
        { _id: entry.creatureId, owner: this.userId }, { fields: { _id: 1 } },
      );
      if (!ownCharacter || bonus !== undefined) {
        throw new Meteor.Error('initiative.denied',
          'Players can only type the initiative result of their own characters');
      }
    }
    const $set = {};
    if (initiative !== undefined) $set['initiative.entries.$.initiative'] = initiative;
    if (bonus !== undefined) $set['initiative.entries.$.bonus'] = bonus;
    if (!Object.keys($set).length) return;
    // A result that reorders the tracker leaves the turn with the same creature
    const entries = folder?.initiative?.entries || [];
    const changed = entries.map(entry => {
      if (entry._id !== entryId) return entry;
      const { roll, ...rest } = entry; // eslint-disable-line @typescript-eslint/no-unused-vars
      return {
        ...rest,
        ...initiative !== undefined && { initiative },
        ...bonus !== undefined && { bonus },
      };
    });
    if (folder?.initiative?.round) {
      $set['initiative.turn'] = turnAfterChange(entries, folder.initiative.turn || 0, changed);
    }
    await CreatureFolders.updateAsync({ _id: folderId, 'initiative.entries._id': entryId }, {
      $set, $unset: { 'initiative.entries.$.roll': 1 },
    });
  },
});

/** Removes an entry, keeping the turn on the same creature */
export const removeInitiativeEntry = new ValidatedMethod({
  name: 'creatureFolders.initiative.remove',
  validate: new SimpleSchema({
    folderId: { type: String, max: 32 },
    entryId: { type: String, max: 32 },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId, entryId }) {
    const folder = await getOwnFolder(folderId, this.userId);
    const tracker = folder.initiative;
    if (!tracker) return;
    const order = initiativeOrder(tracker.entries);
    const index = order.findIndex(entry => entry._id === entryId);
    if (index === -1) return;
    let turn = tracker.turn || 0;
    if (index < turn) turn -= 1;
    const remaining = order.length - 1;
    if (turn >= remaining) turn = 0;
    await CreatureFolders.updateAsync(folderId, {
      $set: {
        'initiative.entries': tracker.entries.filter(entry => entry._id !== entryId),
        'initiative.turn': Math.max(turn, 0),
      },
      $unset: { [`initiativeStats.${entryId}`]: 1 },
    });
  },
});

/** Next (1) or previous (-1) turn, across rounds */
export const advanceInitiative = new ValidatedMethod({
  name: 'creatureFolders.initiative.advance',
  validate: new SimpleSchema({
    folderId: { type: String, max: 32 },
    step: { type: SimpleSchema.Integer, allowedValues: [1, -1] },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId, step }) {
    const folder = await getOwnFolder(folderId, this.userId);
    const tracker = folder.initiative;
    const count = tracker?.entries?.length || 0;
    if (!count) return;
    const order = initiativeOrder(tracker.entries);
    let round = tracker.round || 0;
    let turn = tracker.turn || 0;
    if (round === 0) {
      round = 1;
      turn = 0;
    } else {
      // A creature out of the fight has no turn: skip it, unless all are
      for (let moved = 0; moved < count; moved += 1) {
        turn += step;
        if (turn >= count) {
          turn = 0;
          round += 1;
        } else if (turn < 0) {
          if (round > 1) {
            turn = count - 1;
            round -= 1;
          } else {
            turn = 0;
            break;
          }
        }
        if (!order[turn]?.out) break;
      }
    }
    await CreatureFolders.updateAsync(folderId, {
      $set: { 'initiative.round': round, 'initiative.turn': turn },
    });
    // Going back a turn gives no round back
    if (step === 1) await startTurn(folder, tracker.entries, turn, this.userId);
  },
});

/** Turns counting effect durations down on or off, for the party */
export const setTrackDurations = new ValidatedMethod({
  name: 'creatureFolders.initiative.setTrackDurations',
  validate: new SimpleSchema({
    folderId: { type: String, max: 32 },
    trackDurations: { type: Boolean },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId, trackDurations }) {
    await getOwnFolder(folderId, this.userId);
    await CreatureFolders.updateAsync(folderId, trackDurations
      ? { $unset: { trackDurations: 1 } }
      : { $set: { trackDurations: false } });
  },
});

/** Ends the combat: the tracker is emptied */
export const endInitiative = new ValidatedMethod({
  name: 'creatureFolders.initiative.end',
  validate: new SimpleSchema({ folderId: { type: String, max: 32 } }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId }) {
    await getOwnFolder(folderId, this.userId);
    await CreatureFolders.updateAsync(folderId, { $unset: { initiative: 1, initiativeStats: 1 } });
  },
});
