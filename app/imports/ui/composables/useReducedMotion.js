import { ref, computed } from 'vue';
import { Meteor } from 'meteor/meteor';
import { Tracker } from 'meteor/tracker';

/**
 * Whether animations are reduced: the account's Animations preference
 * ("system" or "reduced", stored as `preferences.reduceMotion`) or, when it
 * follows the system, the system's `prefers-reduced-motion`. Reduced, nothing
 * moves or changes size: only fades of at most 150ms (DESIGN_SYSTEM.md,
 * "Motion").
 */
export function isMotionReduced(preferences, systemReduces) {
  return !!preferences?.reduceMotion || !!systemReduces;
}

// One query and one autorun for the whole app, shared by every caller
let reduced;

function createReducedMotion() {
  const query = typeof window !== 'undefined'
    ? window.matchMedia?.('(prefers-reduced-motion: reduce)')
    : undefined;
  const systemReduces = ref(!!query?.matches);
  query?.addEventListener?.('change', event => systemReduces.value = event.matches);
  const preferences = ref(/** @type {{ reduceMotion?: boolean } | undefined} */ (undefined));
  Tracker.autorun(() => {
    const user = /** @type {{ preferences?: { reduceMotion?: boolean } } | null} */ (
      Meteor.user({ fields: { 'preferences.reduceMotion': 1 } })
    );
    preferences.value = user?.preferences;
  });
  return computed(() => isMotionReduced(preferences.value, systemReduces.value));
}

/** A computed boolean, true when animations are reduced */
export default function useReducedMotion() {
  reduced ??= createReducedMotion();
  return reduced;
}
