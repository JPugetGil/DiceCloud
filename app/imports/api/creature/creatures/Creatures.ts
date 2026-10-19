import SimpleSchema from 'meteor/aldeed:simple-schema';
import ColorSchema from '/imports/api/properties/subSchemas/ColorSchema';
import SharingSchema from '/imports/api/sharing/SharingSchema';
import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';
import type { InferType} from '/imports/api/utility/TypedSimpleSchema';
import { TypedSimpleSchema } from '/imports/api/utility/TypedSimpleSchema';
import type { Simplify } from 'type-fest';
import { Mongo } from 'meteor/mongo';
import { pastSessionFields, sessionFields, SESSION_CLOSED_FIELDS } from '/imports/api/creature/log/discord/discordSession';
import { channelFields } from '/imports/api/creature/log/discord/discordChannel';

const CreatureSettingsSchema = TypedSimpleSchema.from({
  //slowed down by carrying too much?
  useVariantEncumbrance: {
    type: Boolean,
    optional: true,
  },
  //hide spellcasting tab
  hideSpellcasting: {
    type: Boolean,
    optional: true,
  },
  //hide rest buttons
  hideRestButtons: {
    type: Boolean,
    optional: true,
  },
  // Swap around the modifier and stat
  swapStatAndModifier: {
    type: Boolean,
    optional: true,
  },
  // Hide all the unused stats
  hideUnusedStats: {
    type: Boolean,
    optional: true,
  },
  // Show the tree tab
  showTreeTab: {
    type: Boolean,
    optional: true,
  },
  // Hide the spells tab
  hideSpellsTab: {
    type: Boolean,
    optional: true,
  },
  // Hide calculation errors
  hideCalculationErrors: {
    type: Boolean,
    optional: true,
  },
  // How much each hitDice resets on a long rest
  hitDiceResetMultiplier: {
    type: Number,
    optional: true,
    min: 0,
    max: 1,
  },
  // The Discord webhook URL pasted, sealed when the server has a key
  // (pastedWebhooks.ts): no client ever gets it, its editors included
  discordWebhook: {
    type: String,
    optional: true,
    // A URL of STORAGE_LIMITS.url characters, sealed
    max: 2 * STORAGE_LIMITS.url,
  },
});

const CreatureSchema = TypedSimpleSchema.from({
  // Strings
  name: {
    type: String,
    defaultValue: '',
    optional: true,
    max: STORAGE_LIMITS.name,
  },
  alignment: {
    type: String,
    optional: true,
    max: STORAGE_LIMITS.name,
  },
  gender: {
    type: String,
    optional: true,
    max: STORAGE_LIMITS.name,
  },
  picture: {
    type: String,
    optional: true,
    max: STORAGE_LIMITS.url,
  },
  avatarPicture: {
    type: String,
    optional: true,
    max: STORAGE_LIMITS.url,
  },

  // Libraries
  allowedLibraries: {
    type: Array,
    optional: true,
    maxCount: 100,
  },
  'allowedLibraries.$': {
    type: String,
    max: 32,
  },
  allowedLibraryCollections: {
    type: Array,
    optional: true,
    maxCount: 100,
  },
  'allowedLibraryCollections.$': {
    type: String,
    max: 32,
  },

  // Stats that are computed and denormalised outside of recomputation
  denormalizedStats: {
    type: Object,
    defaultValue: {},
  },
  // Sum of all XP gained by this character
  'denormalizedStats.xp': {
    type: SimpleSchema.Integer,
    defaultValue: 0,
  },
  // Sum of all levels granted by milestone XP
  'denormalizedStats.milestoneLevels': {
    type: SimpleSchema.Integer,
    defaultValue: 0,
  },
  propCount: {
    type: SimpleSchema.Integer,
    defaultValue: 0,
  },
  // Does the character need a recompute?
  dirty: {
    type: Boolean,
    optional: true,
  },
  // Version of computation engine that was last used to compute this creature
  computeVersion: {
    type: String,
    optional: true,
  },
  type: {
    type: String,
    defaultValue: 'pc',
    allowedValues: ['pc', 'npc', 'monster'],
  },
  // A party board's monster: the bestiary's creature template it was copied
  // from, a library node. Its type line and lore, which the game master's
  // card shows, and its library, which holds its licence
  templateId: {
    type: String,
    optional: true,
    max: 32,
  },
  computeErrors: {
    type: Array,
    optional: true,
  },
  'computeErrors.$': {
    type: Object,
  },
  'computeErrors.$.type': {
    type: String,
  },
  'computeErrors.$.details': {
    type: Object,
    blackbox: true,
    optional: true,
  },
  lastComputedAt: {
    type: Date,
    optional: true,
  },

  // Settings
  settings: {
    type: CreatureSettingsSchema,
    defaultValue: {},
  },
  // The Discord session its webhook posts into, opened from its settings:
  // only for those who may edit it, as the webhook (webhookVisibility.ts)
  discordSession: {
    type: Object,
    optional: true,
  },
  ...sessionFields('discordSession'),
  // A session whose thread stopped taking messages: it ended by itself, which
  // the character's Discord settings say until the next one. Editors only
  discordSessionClosed: {
    type: Object,
    optional: true,
  },
  'discordSessionClosed.name': SESSION_CLOSED_FIELDS.name,
  'discordSessionClosed.at': SESSION_CLOSED_FIELDS.at,
  // The last sessions DiceCloud opened for it, newest first, which "Resume a
  // session" offers again (discordSession.ts). Editors only too
  ...pastSessionFields('discordSessionHistory'),
  // The Discord channel connected with "Connect to Discord" (D4): its
  // webhook's id, never its token (discordChannel.ts). For editors only too
  discordChannel: {
    type: Object,
    optional: true,
  },
  ...channelFields('discordChannel'),
  // The pasted webhook's id, which is no secret: what its editors get of it
  discordWebhookId: {
    type: String,
    optional: true,
    max: 32,
  },
  // The channel it posts in, once Discord said (pastedWebhooks.ts): to find a
  // party's channel and to post a roll there once (D6). For editors only too
  discordWebhookChannelId: {
    type: String,
    optional: true,
    max: 32,
  },
  // And what that channel is, once known: a forum, or a text channel where
  // the bot creates the sessions' threads. For editors only too
  discordWebhookChannelKind: {
    type: String,
    optional: true,
    allowedValues: ['text', 'forum'] as const,
  },
})
  .extend(ColorSchema)
  .extend(SharingSchema);

export type Creature = Simplify<{ _id: string } & InferType<typeof CreatureSchema>>;

//set up the collection for creatures
const Creatures = new Mongo.Collection<Creature>('creatures');
Creatures.attachSchema(CreatureSchema);

export default Creatures;
export { CreatureSchema };
