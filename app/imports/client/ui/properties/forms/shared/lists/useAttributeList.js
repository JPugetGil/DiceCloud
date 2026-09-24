import { autorun } from 'vue-meteor-tracker';
import createListOfProperties from '/imports/client/ui/properties/forms/shared/lists/createListOfProperties';

export function useAttributeList() {
  return autorun(() => createListOfProperties({ type: { $in: ['attribute', 'skill'] } })).result;
}
