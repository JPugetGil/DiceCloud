import { autorun } from 'vue-meteor-tracker';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import softRemoveProperty from '/imports/api/creature/creatureProperties/methods/softRemoveProperty';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import { getFilter } from '/imports/api/parenting/parentingFunctions';

export function useTabFolders(creatureId, tabName) {
  const dialogStackStore = useDialogStackStore();

  function getFolders(tab, location) {
    return CreatureProperties.find({
      ...getFilter.descendantsOfRoot(creatureId.value ?? creatureId),
      groupStats: true,
      inactive: { $ne: true },
      removed: { $ne: true },
      tab,
      location,
    }, {
      sort: {
        left: 1,
      }
    });
  }

  const startFolders = autorun(() => getFolders(tabName.value ?? tabName, 'start')).result;
  const endFolders = autorun(() => getFolders(tabName.value ?? tabName, 'end')).result;

  function clickProperty({ _id }) {
    dialogStackStore.pushDialogStack({
      component: 'creature-property-dialog',
      elementId: `${_id}`,
      data: { _id },
    });
  }

  function clickTreeProperty({ _id }) {
    dialogStackStore.pushDialogStack({
      component: 'creature-property-dialog',
      elementId: `tree-node-${_id}`,
      data: { _id },
    });
  }

  async function softRemove(_id) {
    try {
      await softRemoveProperty.callAsync({ _id });
    } catch (error) {
      snackbar({ text: error.reason || error.message || error.toString() });
      console.error(error);
    }
  }

  return {
    startFolders,
    endFolders,
    clickProperty,
    clickTreeProperty,
    softRemove,
  };
}
