import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue';

/**
 * Values the server recalculates (armor class, a save, a bonus) change under
 * the user's eyes with no sign (A5): each one that changes is tinted for a
 * moment, with ▲ or ▼. Changes are gathered for WINDOW_MS; more than BURST at
 * once (a whole character recomputed, after an update of the app) show one
 * summary instead (ValueChangeSummary.vue). Nothing flashes while a sheet
 * loads (READY_MS after it mounts), when everything arrives at once.
 */
export const BURST = 12;
export const WINDOW_MS = 120;
export const FLASH_MS = 1200;
export const READY_MS = 2000;

/**
 * Gathers changes and decides how to show them, without timers of its own:
 * `report(key, direction)` as they come, then `flush()` returns
 * `{ flashes: Map(key → direction) }`, or `{ summary: count }` and no flash
 */
export function createChangeBatch(burst = BURST) {
  let pending = new Map();
  return {
    report(key, direction) {
      pending.set(key, direction);
    },
    get size() {
      return pending.size;
    },
    /** @returns {{ flashes: Map<string, string>, summary?: number }} */
    flush() {
      const changes = pending;
      pending = new Map();
      return changes.size > burst ? { flashes: new Map(), summary: changes.size } : { flashes: changes };
    },
  };
}

// The values flashing now, by key, and the summary of a burst
const flashing = reactive(new Map());
export const changeSummary = ref(/** @type {{ count: number, id: number } | undefined} */ (undefined));

const batch = createChangeBatch();
let timer;
let sequence = 0;

function flushBatch() {
  timer = undefined;
  const { flashes, summary } = batch.flush();
  if (summary) {
    const id = ++sequence;
    changeSummary.value = { count: summary, id };
    setTimeout(() => {
      if (changeSummary.value?.id === id) changeSummary.value = undefined;
    }, FLASH_MS * 2);
    return;
  }
  flashes.forEach((direction, key) => {
    const id = ++sequence;
    flashing.set(key, { direction, id });
    setTimeout(() => {
      if (flashing.get(key)?.id === id) flashing.delete(key);
    }, FLASH_MS);
  });
}

function report(key, direction) {
  batch.report(key, direction);
  timer ??= setTimeout(flushBatch, WINDOW_MS);
}

/**
 * 'up' or 'down' for a moment after the value changes, undefined otherwise.
 * `getKey` names the value (a property id and the field shown)
 */
export default function useValueChange(getValue, getKey) {
  let ready = false;
  let readyTimer;
  onMounted(() => {
    readyTimer = setTimeout(() => { ready = true; }, READY_MS);
  });
  onBeforeUnmount(() => clearTimeout(readyTimer));
  watch(getValue, (value, oldValue) => {
    if (!ready || typeof value !== 'number' || typeof oldValue !== 'number' || value === oldValue) return;
    report(getKey(), value > oldValue ? 'up' : 'down');
  });
  return computed(() => flashing.get(getKey())?.direction);
}
