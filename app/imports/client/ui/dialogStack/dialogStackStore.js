import { defineStore } from 'pinia';
import { clone } from 'lodash';
import { Random } from 'meteor/random';

const updateHistory = function (store) {
  if (typeof history === 'undefined' || !history) return;
  if (!history.state || !Number.isFinite(history.state.openDialogs)) {
    let newState = clone(history.state) || {};
    newState.openDialogs = 0;
    history.replaceState(newState, '');
  }

  const numDialogs = store.dialogs.length;
  const stateDialogs = history.state.openDialogs;

  if (numDialogs === stateDialogs) return;

  if (stateDialogs > 0) {
    if (numDialogs === 0) {
      history.back();
    } else {
      let newState = clone(history.state) || {};
      newState.openDialogs = store.dialogs.length;
      history.replaceState(newState, '');
    }
  } else if (numDialogs > 0 && stateDialogs === 0) {
    history.pushState({ openDialogs: numDialogs }, '');
  } else {
    console.warn('History could not be updated correctly, unexpected case', { stateDialogs, numDialogs });
  }
};

export const useDialogStackStore = defineStore('dialogStack', {
  state: () => ({
    dialogs: [],
    currentResult: null,
    currentReturnElement: null,
    replacingDialog: null,
  }),
  actions: {
    pushDialogStack({ component, data, elementId, callback }) {
      const _id = Random.id();
      this.dialogs.push({
        _id,
        component,
        data,
        elementId,
        callback,
      });
      updateHistory(this);
    },
    replaceDialog({ component, data, elementId, callback }) {
      if (!this.dialogs.length) {
        throw new Meteor.Error('can\'t replace dialog if no dialogs are open');
      }
      let currentDialog = this.dialogs[this.dialogs.length - 1];
      this.replacingDialog = currentDialog._id;
      this.dialogs[this.dialogs.length - 1] = {
        _id: Random.id(),
        component,
        data,
        elementId: elementId || currentDialog._id,
        callback: (...args) => {
          callback?.(...args);
          return currentDialog.callback?.(...args);
        },
      };
    },
    popDialogStackMutation(result) {
      const dialog = this.dialogs.pop();
      this.currentResult = null;
      updateHistory(this);
      if (!dialog) return;
      if (dialog.callback) {
        const returnElement = dialog.callback(result);
        if (returnElement && typeof returnElement.then === 'function') {
          this.currentReturnElement = null;
          returnElement
            .then(elementId => {
              this.currentReturnElement = elementId;
            })
            .catch(error => {
              console.error(error);
            });
        } else {
          this.currentReturnElement = returnElement;
        }
      } else {
        this.currentReturnElement = null;
      }
    },
    setCurrentResult(result) {
      this.currentResult = result;
    },
    popDialogStack(result) {
      if (typeof history !== 'undefined' && history.state && history.state.openDialogs) {
        this.setCurrentResult(result);
        history.back();
      } else {
        this.popDialogStackMutation(result);
      }
    },
    popDialogStacks(quantity) {
      if (quantity <= 0) return;
      let iterationsLeft = quantity;
      let intervalId = setInterval(() => {
        if (typeof history !== 'undefined' && history.state && history.state.openDialogs) {
          this.setCurrentResult(null);
          history.back();
        } else {
          this.popDialogStackMutation(null);
        }
        iterationsLeft -= 1;
        if (iterationsLeft === 0) {
          clearInterval(intervalId);
        }
      }, 150);
    },
  },
});
