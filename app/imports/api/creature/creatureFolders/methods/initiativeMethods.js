import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import initiativeOrder from '/imports/api/creature/creatureFolders/initiativeOrder';
import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';
import { getPartyRole } from '/imports/api/creature/creatureFolders/party';

/*
 * The initiative tracker of a party board, stored on its character folder.
 * The folder's owner, the game master, runs it; the players of the party only
 * type their own characters' results.
 */

const rateLimit = { numRequests: 10, timeInterval: 5000 };

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
      $set: { initiative: { round: 1, turn: 0, entries } },
    });
  },
});

/** Adds a creature by hand: rolled from its bonus unless given a result */
export const addInitiativeEntry = new ValidatedMethod({
  name: 'creatureFolders.initiative.add',
  validate: new SimpleSchema({
    folderId: { type: String, max: 32 },
    name: { type: String, max: STORAGE_LIMITS.name },
    bonus: { type: Number, optional: true },
    initiative: { type: Number, optional: true },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit,
  async run({ folderId, name, bonus, initiative }) {
    const folder = await getOwnFolder(folderId, this.userId);
    if (Meteor.isClient) return;
    let entry = { _id: Random.id(), name, bonus: bonus || 0 };
    entry = Number.isFinite(initiative) ? { ...entry, initiative } : rolled(entry);
    const tracker = folder.initiative || { round: 0, turn: 0, entries: [] };
    await CreatureFolders.updateAsync(folderId, {
      $set: { initiative: { ...tracker, entries: [...(tracker.entries || []), entry] } },
    });
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
    let round = tracker.round || 0;
    let turn = (tracker.turn || 0) + step;
    if (round === 0) {
      round = 1;
      turn = 0;
    } else if (turn >= count) {
      turn = 0;
      round += 1;
    } else if (turn < 0) {
      if (round > 1) {
        turn = count - 1;
        round -= 1;
      } else {
        turn = 0;
      }
    }
    await CreatureFolders.updateAsync(folderId, {
      $set: { 'initiative.round': round, 'initiative.turn': turn },
    });
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
    await CreatureFolders.updateAsync(folderId, { $unset: { initiative: 1 } });
  },
});
