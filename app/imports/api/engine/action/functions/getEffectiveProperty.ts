import { EngineAction } from '/imports/api/engine/action/EngineActions';
import { get, set } from 'lodash';
import { EJSON } from 'meteor/ejson';

/**
 * A property as the action so far has left it. The updates in the action's
 * results are only written when the action ends, so a later task reading the
 * property directly sees it as it was before the action: a second hit could
 * take an attribute below zero, and healing after damage found nothing to heal.
 */
export default function getEffectiveProperty<T extends { _id: string }>(
  action: EngineAction, prop: T
): T {
  let effective = prop;
  for (const result of action.results) {
    for (const mutation of result.mutations) {
      for (const update of mutation.updates || []) {
        if (update.propId !== prop._id) continue;
        // Copy once, and only when something changes, so the cache is untouched
        if (effective === prop) effective = EJSON.clone(prop);
        for (const key in update.set) {
          set(effective, key, update.set[key]);
        }
        for (const key in update.inc) {
          set(effective, key, (get(effective, key) || 0) + update.inc[key]);
        }
      }
    }
  }
  return effective;
}
