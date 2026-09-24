import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

if (window) {
  window.onpopstate = function (event) {
    let state = event.state;
    const dialogStackStore = useDialogStackStore();
    let numDialogs = dialogStackStore.dialogs.length;
    if (state && Number.isFinite(state.openDialogs) && numDialogs > state.openDialogs) {
      dialogStackStore.popDialogStackMutation(dialogStackStore.currentResult);
    }
  };
}
