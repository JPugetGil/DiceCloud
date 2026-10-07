import { Meteor } from 'meteor/meteor';
import { englishMessage } from '/imports/api/creature/log/logMessages';

/*
 * The monsters of a party board: creatures of type 'monster' that its game
 * master copies from a bestiary's creature template, one creature per copy
 * ("Goblin 1" to "Goblin 4"), and deletes at the end of the encounter. They
 * are the game master's, and don't count towards the character limit: a board
 * holds up to MAX_BOARD_MONSTERS of them instead. The players see of them, as
 * of a non-player character, only their name, picture and conditions, never
 * their hit points nor any other stat (partyBoard).
 */

// The game master's creatures whose stats the players never see
export const GM_CREATURE_TYPES = Object.freeze(['monster', 'npc']);

// Monsters on one party board, which its game master can add at once too.
// Measured on 2026-10-07: adding 30 goblins takes 1.7 s, 30 liches (the
// bestiary's largest) 6.7 s; the game master's board then weighs 100 to 270
// KB, a player's 7 KB, and a turn sends each of them 4 KB
export const MAX_BOARD_MONSTERS = 30;

// Monsters a game master owns across all their boards: about three full
// boards, 3 MB of average monsters
export const MAX_OWNED_MONSTERS = 100;

// What the bestiary picker filters on: the SRD bestiary tags each monster
// with its challenge rating (`cr-1/4`), its size and its creature type, in
// English whatever its language
export const MONSTER_SIZES = Object.freeze(['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']);
export const MONSTER_TYPES = Object.freeze([
  'aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant',
  'humanoid', 'monstrosity', 'ooze', 'plant', 'undead',
]);
export const CHALLENGE_RATINGS = Object.freeze([
  '0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1)),
]);

/**
 * A monster's challenge rating, size and type, from its library tags; those
 * it lacks are undefined
 */
export function monsterTags(libraryTags = []) {
  return {
    cr: libraryTags.find(tag => tag.startsWith('cr-'))?.slice(3),
    size: MONSTER_SIZES.find(size => libraryTags.includes(size)),
    type: MONSTER_TYPES.find(type => libraryTags.includes(type)),
  };
}

/**
 * A refusal of the board's methods: its reason in English, from en.json, and
 * in its details the message the board shows in the reader's language,
 * `{ i18n: { key, params } }` (monsters.errors.*, initiative.full)
 */
export function boardError(code, key, params = {}) {
  // any: Meteor's types say details are a string; DDP sends any EJSON value
  const details = /** @type {any} */ ({ i18n: { key, params } });
  return new Meteor.Error(code, englishMessage(key, params), details);
}

/** Whether the players of a party see only the creature's name, picture and conditions */
export function hidesStatsFromPlayers(creature) {
  return GM_CREATURE_TYPES.includes(creature?.type);
}
