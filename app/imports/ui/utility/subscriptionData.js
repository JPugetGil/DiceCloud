import { unref } from 'vue';
import { Meteor } from 'meteor/meteor';

/**
 * Reads one field of a subscription's data, synchronously and reactively.
 *
 * The handle's own data() is async under nachocodoner:reactive-publish, and the
 * meteor: computeds that read it cannot await. The data itself is mirrored into
 * a client-side minimongo collection keyed by subscription id, and a minimongo
 * read is both synchronous and reactive, so read it there instead. The package
 * does not export that collection; it hangs it off the connection when the
 * first subscription is made, which has always happened by the time a handle
 * exists to pass in.
 *
 * `handle` is the Meteor handle, or a ref holding one. vue-meteor-tracker's
 * `subscribe(() => [...])` returns it as `sub`, a getter that follows the
 * current subscription: read `result.sub` here, never a destructured copy,
 * which stays the first, stopped handle once the arguments change. Call this
 * inside an `autorun`, not a `computed`: the minimongo read is reactive to
 * Tracker only.
 */
export default function subscriptionData(handle, path) {
  handle = unref(handle);
  const collection = Meteor.connection._subscriptionData;
  if (!handle || !collection) return undefined;
  const data = collection.findOne(handle.subscriptionId, { fields: { [path]: 1 } });
  return data?.[path];
}
