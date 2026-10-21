import { TypedSimpleSchema } from '/imports/api/utility/TypedSimpleSchema';

let SoftRemovableSchema = TypedSimpleSchema.from({
  // Not indexed: true for a few documents, the index misled the planner for
  // `removed: { $ne: true }` (treeIndexes)
  'removed': {
    type: Boolean,
    optional: true,
  },
  'removedAt': {
    type: Date,
    optional: true,
    index: 1,
  },
  'removedWith': {
    optional: true,
    type: String,
    max: 32,
    index: 1,
  },
});

export default SoftRemovableSchema;
