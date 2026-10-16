import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';
import createPropertySchema from '/imports/api/properties/subSchemas/createPropertySchema';
import { TypedSimpleSchema } from '/imports/api/utility/TypedSimpleSchema';

const BuffSchema = createPropertySchema({
  name: {
    type: String,
    optional: true,
    max: STORAGE_LIMITS.name,
  },
  description: {
    type: 'inlineCalculationFieldToCompute' as const,
    optional: true,
  },
  hideRemoveButton: {
    type: Boolean,
    optional: true,
  },
  // How many rounds this buff lasts
  duration: {
    type: 'fieldToCompute',
    optional: true,
  },
  // Whose turns count the duration down (phase 3.5 of the monsters): the
  // creature the buff is on ('holder', the default), or the one that applied
  // it ('source', appliedBy): "until the end of the caster's next turn"
  durationAnchor: {
    type: String,
    allowedValues: ['holder', 'source'] as const,
    optional: true,
  },
  // When in that creature's turn: its start ('turnStart', the default), or
  // its end ('turnEnd'), counting only the turns that start after the buff
  // was applied: its "next turn"
  durationEvent: {
    type: String,
    allowedValues: ['turnStart', 'turnEnd'] as const,
    optional: true,
  },
  target: {
    type: String,
    allowedValues: [
      'self',
      'target',
    ],
    defaultValue: 'target',
  },
  // Prevent the property from showing up in the log
  silent: {
    type: Boolean,
    optional: true,
  },
  // Prevent the children from being crystalized
  skipCrystalization: {
    type: Boolean,
    optional: true,
  },
});

const ComputedOnlyBuffSchema = createPropertySchema({
  description: {
    type: 'computedOnlyInlineCalculationField' as const,
    optional: true,
    max: STORAGE_LIMITS.description,
  },
  duration: {
    type: 'computedOnlyField' as const,
    optional: true,
  },
  // The rounds spent, counted by the initiative tracker (countDurationsDown).
  // A buff that ends at the end of a turn has none until its creature's
  // first turn starts after it was applied: a turn under way when it was
  // applied is not its "next turn"
  durationSpent: {
    type: Number,
    optional: true,
    min: 0,
  },
  // The creature that applied it to another (applyBuffProperty), or that the
  // board's duration menu names: whose turns count it down when its
  // durationAnchor is 'source'
  appliedBy: {
    type: Object,
    optional: true,
  },
  'appliedBy.name': {
    type: String,
    max: STORAGE_LIMITS.name,
  },
  'appliedBy.id': {
    type: String,
    max: 32,
    // The buffs a creature's turn counts down on the other creatures of its
    // party (turnEvents.ts); sparse: only buffs another applied have it
    index: 1,
    sparse: true,
  },
  'appliedBy.collection': {
    type: String,
    max: STORAGE_LIMITS.collectionName,
  },
});

const ComputedBuffSchema = TypedSimpleSchema.from({})
  .extend(BuffSchema)
  .extend(ComputedOnlyBuffSchema);

export { BuffSchema, ComputedOnlyBuffSchema, ComputedBuffSchema };
