import { EJSON } from 'meteor/ejson';
import { AsyncTracker } from 'meteor/nachocodoner:reactive-publish';

/**
 * Publishes what `run` returns, and runs it again whenever something it read
 * changes, as `this.autorun` of nachocodoner:reactive-publish does, without
 * its leak.
 *
 * With reactive-publish 1.1.1, the latest release, Meteor observed each run's
 * cursors and stopped those observers only with the subscription: a rerun left
 * the previous run's observers running, still sending their documents. A
 * player removed from a party kept receiving the board's new conditions while
 * the board stayed open, and an open character sheet gained 8 observers each
 * time one of its properties changed (2026-10-08). The reads that make a run
 * reactive (each findOneAsync, each fetch) stayed observed until the
 * subscription stopped too.
 *
 * Here each run reads in a computation of its own, stopped as soon as one of
 * its reads changes, which starts the next run. Only the latest run sends
 * anything: the previous run's observers stop forwarding when the next run
 * starts, and stop once the new observers have sent their documents (an
 * identical cursor then shares its Mongo observer instead of querying again).
 * The documents the new run no longer publishes leave the client, and those it
 * publishes again lose the fields it no longer sends. The documents go out
 * through Subscription's own methods: the package's replacements keep
 * bookkeeping of their own, which this replaces.
 *
 * `run` is called with the publication as `this` and `{ firstRun, data }`:
 * firstRun is true until a run has published, and data holds the values of
 * the subscription data keys listed in options.data (this.setData on the
 * client). A change to one of them starts a new run; read them there rather
 * than with this.data, which in a new computation reports its first read as
 * a change: each run would start the next, endlessly. The run returns a
 * cursor, an array of cursors, or nothing (after this.error, say). A cursor
 * it creates reruns it whenever one of its documents changes, and a rerun
 * sends every document again: create in AsyncTracker.nonreactive the cursors
 * nothing in the run depends on. The publication is ready once a run's
 * cursors have sent their documents.
 *
 * @param {import('meteor/meteor').Subscription} publication The publish function's `this`
 * @param {(this: import('meteor/meteor').Subscription, run: { firstRun: boolean, data: Record<string, any> }) => unknown} run
 * @param {{ data?: string[], addedFields?: Record<string, object> }} [options]
 *   data: the subscription data keys the run reads; addedFields: by
 *   collection, fields added to each document it sends, such as a flag the
 *   client filters on
 */
export default function reactivePublication(publication, run, { data: dataKeys = [], addedFields = {} } = {}) {
  // Subscription's internals: its own methods, its ids' encoding, its state
  const self = /** @type {any} */ (publication);
  const subscription = Object.getPrototypeOf(self);
  const { idStringify, idParse } = self._idFilter;
  // What the client holds: by collection, each document's fields' names, by id
  /** @type {Map<string, Map<string, Set<string>>>} */
  const sent = new Map();
  // The runs whose observers may still be running
  /** @type {Set<Run>} */
  const live = new Set();
  /** @type {Run | undefined} */
  let latest;
  let published = false;
  let stopped = false;
  // The subscription data keys' values, and the computation that watches them
  /** @type {Record<string, any>} */
  let data = {};
  /** @type {import('meteor/nachocodoner:reactive-publish').AsyncTrackerComputation | undefined} */
  let watcher;

  /**
   * @typedef {object} Run
   * @property {boolean} active Whether its observers forward what they see
   * @property {boolean} ended Whether its observers are stopped
   * @property {any[]} handles Its observers
   * @property {Map<string, Set<string>>} ids By collection, what it publishes
   * @property {import('meteor/nachocodoner:reactive-publish').AsyncTrackerComputation} [reads]
   */

  /** @param {Run} done */
  function end(done) {
    done.active = false;
    done.ended = true;
    live.delete(done);
    done.handles.forEach(handle => handle.stop());
    done.handles = [];
  }

  function start() {
    if (stopped) return;
    if (latest) {
      latest.active = false;
      latest.reads?.stop();
    }
    /** @type {Run} */
    const thisRun = { active: true, ended: false, handles: [], ids: new Map() };
    latest = thisRun;
    live.add(thisRun);
    const firstRun = !published;
    // Outside any computation: the reads must not rerun another one
    AsyncTracker.nonreactive(() => AsyncTracker.autorun(async (computation) => {
      thisRun.reads = computation;
      computation.onInvalidate(() => {
        computation.stop();
        start();
      });
      try {
        await publish(thisRun, await run.call(publication, { firstRun, data }));
      } catch (error) {
        if (!thisRun.active) return end(thisRun);
        publication.error(/** @type {Error} */ (error));
      }
    }));
  }

  /**
   * @param {Run} thisRun
   * @param {unknown} result
   */
  async function publish(thisRun, result) {
    if (!thisRun.active || self._isDeactivated()) return end(thisRun);
    const cursors = /** @type {any[]} */ (!result ? [] : Array.isArray(result) ? result : [result]);
    // Meteor's own rules for what a publish function returns
    if (!cursors.every(cursor => cursor?._publishCursor)) {
      throw new Error('Publish function can only return a Cursor or an array of Cursors');
    }
    const collections = cursors.map(cursor => cursor._getCollectionName());
    const repeated = collections.find((name, i) => collections.indexOf(name) !== i);
    if (repeated) throw new Error(`Publish function returned multiple cursors for collection ${repeated}`);

    await Promise.all(cursors.map(cursor => observe(thisRun, cursor)));
    // Replaced while its observers started: the next run publishes
    if (!thisRun.active) return end(thisRun);
    for (const [collection, docs] of sent) {
      for (const id of docs.keys()) {
        if (thisRun.ids.get(collection)?.has(id)) continue;
        docs.delete(id);
        subscription.removed.call(publication, collection, idParse(id));
      }
    }
    live.forEach(other => other !== thisRun && end(other));
    published = true;
    subscription.ready.call(publication);
  }

  /**
   * Observes the cursor for the run, outside any computation: the observer
   * must not be another of the run's reactive reads
   * @param {Run} thisRun
   * @param {any} cursor
   */
  async function observe(thisRun, cursor) {
    const collection = cursor._getCollectionName();
    const extra = addedFields[collection];
    const handle = await AsyncTracker.nonreactive(() => cursor.observeChanges({
      added(id, fields) {
        if (thisRun.active) add(thisRun, collection, id, extra ? { ...fields, ...extra } : fields);
      },
      changed(id, fields) {
        if (thisRun.active) change(collection, id, fields);
      },
      removed(id) {
        if (thisRun.active) remove(thisRun, collection, id);
      },
    }, { nonMutatingCallbacks: true }));
    if (thisRun.ended) handle.stop();
    else thisRun.handles.push(handle);
  }

  /**
   * @param {Run} thisRun
   * @param {string} collection
   * @param {any} id
   * @param {Record<string, any>} fields
   */
  function add(thisRun, collection, id, fields) {
    const key = idStringify(id);
    if (!thisRun.ids.has(collection)) thisRun.ids.set(collection, new Set());
    thisRun.ids.get(collection)?.add(key);
    if (!sent.has(collection)) sent.set(collection, new Map());
    const docs = /** @type {Map<string, Set<string>>} */ (sent.get(collection));
    const before = docs.get(key);
    docs.set(key, new Set(Object.keys(fields)));
    if (!before) {
      subscription.added.call(publication, collection, id, fields);
      return;
    }
    // Sent by an earlier run: sent again, without the fields this run leaves out
    const update = { ...fields };
    before.forEach(name => {
      if (!(name in update)) update[name] = undefined;
    });
    subscription.changed.call(publication, collection, id, update);
  }

  /**
   * @param {string} collection
   * @param {any} id
   * @param {Record<string, any>} fields
   */
  function change(collection, id, fields) {
    const names = sent.get(collection)?.get(idStringify(id));
    Object.entries(fields).forEach(([name, value]) => {
      if (value === undefined) names?.delete(name);
      else names?.add(name);
    });
    subscription.changed.call(publication, collection, id, fields);
  }

  /**
   * @param {Run} thisRun
   * @param {string} collection
   * @param {any} id
   */
  function remove(thisRun, collection, id) {
    const key = idStringify(id);
    thisRun.ids.get(collection)?.delete(key);
    sent.get(collection)?.delete(key);
    subscription.removed.call(publication, collection, id);
  }

  publication.onStop(() => {
    stopped = true;
    watcher?.stop();
    latest?.reads?.stop();
    live.forEach(end);
  });
  if (!dataKeys.length) {
    start();
    return;
  }
  // A single computation for the subscription data: its first read is
  // reported as a change once, and the runs' own setData change other keys
  AsyncTracker.nonreactive(() => AsyncTracker.autorun(async (computation) => {
    watcher = computation;
    const all = (await self.data()) || {};
    const values = Object.fromEntries(dataKeys.map(key => [key, all[key]]));
    if (latest && EJSON.equals(values, data)) return;
    data = values;
    start();
  }));
}

/**
 * findOneAsync for the reads that decide what a run may publish. Meteor
 * observes a findOneAsync (limit: 1) by polling the database every 10
 * seconds, and so sees a change written by anything but this server only
 * then: a script, another server. Without the limit, the oplog tells at once
 *
 * @param {import('meteor/mongo').Mongo.Collection<any>} collection
 * @param {any} selector
 * @param {any} [options]
 */
export async function findOneReactive(collection, selector, options) {
  return (await collection.find(selector, options).fetchAsync())[0];
}
