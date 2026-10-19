// Modified from https://gitlab.com/tozd/vue/snackbar-que
import { reactive } from 'vue';

/**
 * @typedef {object} SnackbarData
 * @property {string} [text]
 * @property {any[]} [content] A log entry's content, shown in place of the text
 * @property {() => unknown} [callback]
 * @property {string} [callbackName]
 * @property {string} [logId]
 */
/**
 * @typedef {{ data: SnackbarData, id: number, enqueuedAt: Date, shown: boolean, thrown?: boolean }} QueuedSnackbar
 */

/** @type {{ queue: QueuedSnackbar[] }} */
const globalState = reactive({ queue: [] });
let lastSnackbarId = 0;

/** @param {SnackbarData} data */
function snackbar(data) {
  globalState.queue.push({
    data, //{text OR content, callback, callbackName} // content is logContent
    id: ++lastSnackbarId,
    enqueuedAt: new Date(),
    shown: false,
  });
}

export { snackbar, globalState }
