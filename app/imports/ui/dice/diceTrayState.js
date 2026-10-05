import { reactive } from 'vue';

/**
 * The log entries the dice tray is throwing, by id, so that the same roll is
 * not shown three times at once (DESIGN_SYSTEM.md, "Motion"): the log and the
 * snackbar show an entry once its dice have landed, not while they tumble.
 *
 * - 'flying': the dice are in the air; the log and the snackbar wait
 * - 'showing': the dice have landed, the tray shows the result. On a phone
 *   the tray covers the snackbar, which waits for it to leave
 * - 'done': the tray has gone
 *
 * An entry the tray did not throw (no dice, another character) is not here.
 */
const phases = reactive(new Map());

export function setThrowPhase(logId, phase) {
  phases.set(logId, phase);
}

export function throwPhase(logId) {
  return phases.get(logId);
}

/** Whether the tray threw this entry's dice */
export function wasThrown(logId) {
  return phases.has(logId);
}

/** Every entry still flying or showing is let go: the tray stopped */
export function endThrows() {
  phases.forEach((phase, logId) => {
    if (phase !== 'done') phases.set(logId, 'done');
  });
}

export function forgetThrows() {
  phases.clear();
}
