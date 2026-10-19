import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';
import type { InferType} from '/imports/api/utility/TypedSimpleSchema';
import { TypedSimpleSchema } from '/imports/api/utility/TypedSimpleSchema';
import type { Simplify } from 'type-fest';

const ErrorSchema = TypedSimpleSchema.from({
  message: {
    type: String,
    max: STORAGE_LIMITS.errorMessage,
  },
  type: {
    type: String,
    max: STORAGE_LIMITS.name,
  },
});

export type ErrorSchemaType = Simplify<InferType<typeof ErrorSchema>>;

export default ErrorSchema;
