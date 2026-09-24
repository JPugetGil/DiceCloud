import { autorun } from 'vue-meteor-tracker';
import createListOfProperties from '/imports/client/ui/properties/forms/shared/lists/createListOfProperties';

export function useSaveList() {
  return autorun(() => createListOfProperties({ type: 'skill', skillType: 'save' })).result;
}
