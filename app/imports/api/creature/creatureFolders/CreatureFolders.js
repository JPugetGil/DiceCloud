import SimpleSchema from 'meteor/aldeed:simple-schema';
import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';
import { MAX_INITIATIVE_ENTRIES } from '/imports/api/creature/creatureFolders/initiativeOrder';
import { DiscordSessionSchema } from '/imports/api/creature/log/discord/discordSession';
import { PUBLISH_KINDS } from '/imports/api/creature/log/discord/partyPublishing';

let CreatureFolders = new Mongo.Collection('creatureFolders');

// Players in a party besides its game master
export const MAX_PARTY_MEMBERS = 16;

let creatureFolderSchema = new SimpleSchema({
  name: {
    type: String,
    trim: false,
    optional: true,
    max: STORAGE_LIMITS.name,
  },
  creatures: {
    type: Array,
    defaultValue: [],
  },
  'creatures.$': {
    type: String,
    max: 32,
  },
  owner: {
    type: String,
    max: 32,
    index: 1,
  },
  archived: {
    type: Boolean,
    optional: true,
  },
  // The players who joined the folder's party board through its invitation.
  // The owner is the game master
  members: {
    type: Array,
    defaultValue: [],
    index: 1,
    maxCount: MAX_PARTY_MEMBERS,
  },
  'members.$': {
    type: String,
    max: 32,
  },
  // The secret of the party's invitation link, unset when there is none
  inviteToken: {
    type: String,
    optional: true,
    max: 32,
    index: 1,
  },
  order: {
    type: Number,
    defaultValue: 0,
  },
  // Whether the initiative tracker counts down effect durations, at the start
  // of each creature's turn. On unless the game master turns it off
  trackDurations: {
    type: Boolean,
    optional: true,
  },
  // The folder's initiative tracker, on its party board. Round 0: no combat
  initiative: {
    type: Object,
    optional: true,
  },
  'initiative.round': {
    type: SimpleSchema.Integer,
    min: 0,
    defaultValue: 0,
  },
  // The index, in initiative order, of the entry whose turn it is
  'initiative.turn': {
    type: SimpleSchema.Integer,
    min: 0,
    defaultValue: 0,
  },
  'initiative.entries': {
    type: Array,
    defaultValue: [],
    maxCount: MAX_INITIATIVE_ENTRIES,
  },
  'initiative.entries.$': {
    type: Object,
  },
  'initiative.entries.$._id': {
    type: String,
    max: 32,
  },
  // A character of the folder, or none for a creature added by hand
  'initiative.entries.$.creatureId': {
    type: String,
    max: 32,
    optional: true,
  },
  'initiative.entries.$.name': {
    type: String,
    max: STORAGE_LIMITS.name,
    optional: true,
  },
  // The roll's result, once rolled or typed
  'initiative.entries.$.initiative': {
    type: Number,
    optional: true,
  },
  // Added to the d20, and breaks ties
  'initiative.entries.$.bonus': {
    type: Number,
    optional: true,
  },
  // The d20 of the last roll, to show how the result came about
  'initiative.entries.$.roll': {
    type: SimpleSchema.Integer,
    optional: true,
  },
  // Out of the fight, which its turn then skips
  'initiative.entries.$.out': {
    type: Boolean,
    optional: true,
  },
  // The game master shows the players the creatures' hit points and armor class
  'initiative.showStats': {
    type: Boolean,
    optional: true,
  },
  // The game master's: by entry id, { hp, ac, damage } of the creatures added
  // by hand. Kept out of the entries so that the publications can leave it out
  // for the players (initiativeCreatures.js)
  initiativeStats: {
    type: Object,
    blackbox: true,
    optional: true,
  },
  // The party's Discord channel (D2), the game master's alone: a top-level
  // field, which the publications leave out for everyone else (the mergebox
  // merges by top-level field). Its webhook URL, the session it posts into,
  // and the initiative message it keeps up to date during a fight
  discord: {
    type: Object,
    optional: true,
  },
  'discord.webhook': {
    type: String,
    optional: true,
    max: STORAGE_LIMITS.url,
  },
  // What it posts (partyPublishing.ts): false turns everything off, the
  // webhook kept; by kind of message, false for those turned off
  'discord.enabled': {
    type: Boolean,
    optional: true,
  },
  'discord.publish': {
    type: Object,
    optional: true,
  },
  ...Object.fromEntries(PUBLISH_KINDS.map(kind => [`discord.publish.${kind}`, { type: Boolean, optional: true }])),
  'discord.session': {
    type: DiscordSessionSchema,
    optional: true,
  },
  'discord.initiative': {
    type: Object,
    optional: true,
  },
  'discord.initiative.webhookId': {
    type: String,
    max: 32,
  },
  'discord.initiative.messageId': {
    type: String,
    max: 32,
  },
  'discord.initiative.threadId': {
    type: String,
    optional: true,
    max: 32,
  },
  // What the party posts to Discord, its rolls and its fights
  // (postingSummary): all the players see of it, so that they know where
  // their rolls go. The URL stays the game master's
  discordPosting: {
    type: Object,
    optional: true,
  },
  'discordPosting.rolls': {
    type: Boolean,
    optional: true,
  },
  'discordPosting.combat': {
    type: Boolean,
    optional: true,
  },
});

CreatureFolders.attachSchema(creatureFolderSchema);

import '/imports/api/creature/creatureFolders/methods/index';
import { Mongo } from 'meteor/mongo';
export default CreatureFolders;
