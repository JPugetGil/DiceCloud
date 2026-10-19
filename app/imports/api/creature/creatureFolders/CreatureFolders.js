import SimpleSchema from 'meteor/aldeed:simple-schema';
import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';
import { MAX_INITIATIVE_ENTRIES } from '/imports/api/creature/creatureFolders/initiativeOrder';
import { DiscordSessionSchema, SESSION_CLOSED_FIELDS, pastSessionFields } from '/imports/api/creature/log/discord/discordSession';
import { PUBLISH_KINDS } from '/imports/api/creature/log/discord/partyPublishing';
import { channelFields } from '/imports/api/creature/log/discord/discordChannel';

// Ids are strings, as everywhere in the app: untyped, Meteor's types expect ObjectIds
/** @type {Mongo.Collection<any>} */
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
  // Whether the players may target the game master's monsters and
  // non-player characters with their characters' actions and spells
  // (party.ts, playersTargetMonsters). On unless the game master turns it
  // off: false, never true. The players read it, which hides the monsters
  // from their target picker
  playersTargetMonsters: {
    type: Boolean,
    optional: true,
  },
  // The party's encounter under way, which the server names the first time
  // a creature of the party acts on another during it, and forgets when the
  // game master ends the combat or the encounter: what the creatures
  // received in it can be undone until then (encounters.ts)
  encounterId: {
    type: String,
    max: 32,
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
  // The round in which its turn last started, and ended: its creature's turn
  // events happen once a round, however the turn goes back and forth
  // (server/turnEvents.ts)
  'initiative.entries.$.startedRound': {
    type: SimpleSchema.Integer,
    min: 0,
    optional: true,
  },
  'initiative.entries.$.endedRound': {
    type: SimpleSchema.Integer,
    min: 0,
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
  // The URL pasted, sealed when the server has a key (pastedWebhooks.ts):
  // no client ever gets it, the game master included; they get its id
  'discord.webhook': {
    type: String,
    optional: true,
    // A URL of STORAGE_LIMITS.url characters, sealed
    max: 2 * STORAGE_LIMITS.url,
  },
  'discord.webhookId': {
    type: String,
    optional: true,
    max: 32,
  },
  // The channel it posts in, once Discord said (pastedWebhooks.ts)
  'discord.webhookChannelId': {
    type: String,
    optional: true,
    max: 32,
  },
  // And what that channel is, once known: a forum, or a text channel where
  // the bot creates the sessions' threads
  'discord.webhookChannelKind': {
    type: String,
    optional: true,
    allowedValues: ['text', 'forum'],
  },
  // Or the channel connected with "Connect to Discord" (D4): its webhook's
  // id, never its token (discordChannel.ts)
  'discord.channel': {
    type: Object,
    optional: true,
  },
  ...channelFields('discord.channel'),
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
  // A session whose thread stopped taking messages, ended by itself: the
  // board says so until the next one
  'discord.sessionClosed': {
    type: Object,
    optional: true,
  },
  'discord.sessionClosed.name': SESSION_CLOSED_FIELDS.name,
  'discord.sessionClosed.at': SESSION_CLOSED_FIELDS.at,
  // The last sessions DiceCloud opened for the party, newest first, which
  // "Resume a session" offers again (discordSession.ts)
  ...pastSessionFields('discord.sessionHistory'),
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

// Its methods are registered by register-api.js on the server, and on the
// client by the components that call them: importing them here made the
// collection and its 17 method modules one import cycle (tests/cycles)
import { Mongo } from 'meteor/mongo';
export default CreatureFolders;
