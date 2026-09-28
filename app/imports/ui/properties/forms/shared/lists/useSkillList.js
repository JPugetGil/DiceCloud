import { autorun } from 'vue-meteor-tracker';
import createListOfProperties from '/imports/ui/properties/forms/shared/lists/createListOfProperties';

export function useSkillList() {
  return autorun(() => createListOfProperties({ type: 'skill' })).result;
}
