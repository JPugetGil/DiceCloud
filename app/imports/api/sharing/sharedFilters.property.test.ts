import { assert } from 'chai';
import fc from 'fast-check';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { readableBy, sharedWith } from '/imports/api/sharing/sharedFilters';

/*
 * The sharing selectors, on random documents and users: MongoDB (the
 * publications) and Minimongo (the pages) select exactly the documents the
 * sharing rules give.
 */
type SharedDoc = { _id: string, owner: string, readers?: string[], writers?: string[], public?: boolean };

const users = ['ann', 'bob', 'cid'];
const user = fc.constantFrom(...users);
// Each field may be missing, as on documents written before it
const sharedDoc = (_id: string): fc.Arbitrary<SharedDoc> => fc.record({
  _id: fc.constant(_id),
  owner: user,
  readers: fc.uniqueArray(user, { maxLength: 3 }),
  writers: fc.uniqueArray(user, { maxLength: 3 }),
  public: fc.boolean(),
}, { requiredKeys: ['_id', 'owner'] });
const docs = fc.integer({ min: 0, max: 8 })
  .chain(count => fc.tuple(...Array.from({ length: count }, (_, i) => sharedDoc(`doc${i}`))));
const viewer = fc.oneof(user, fc.constant('nobody'), fc.constant(null), fc.constant(undefined));
const followed = fc.option(fc.subarray(Array.from({ length: 8 }, (_, i) => `doc${i}`)), { nil: undefined });

/** The rules: the owner, writers and readers see a document; anyone a public one (among those followed, when given) */
const sharedWithModel = (doc: SharedDoc, userId: string) =>
  doc.owner === userId || !!doc.writers?.includes(userId) || !!doc.readers?.includes(userId);
const readableModel = (doc: SharedDoc, userId: string | null | undefined, publicIds?: string[]) =>
  (!!userId && sharedWithModel(doc, userId)) || (doc.public === true && (!publicIds || publicIds.includes(doc._id)));

const ids = (list: { _id: string }[]) => list.map(doc => doc._id).sort();

if (Meteor.isServer) describe('Sharing selectors (properties)', function () {
  const numRuns = Number(process.env.FC_NUM_RUNS) || 150;
  // About 3 ms a run, against the database
  this.timeout(30000 + numRuns * 10);
  const stored = new Mongo.Collection<SharedDoc>('sharedFiltersProperties');
  const local = new Mongo.Collection<SharedDoc>(null);

  async function store(list: SharedDoc[]) {
    await stored.rawCollection().deleteMany({});
    await local.removeAsync({});
    if (list.length) await stored.rawCollection().insertMany(list);
    for (const doc of list) await local.insertAsync(doc);
  }

  after(async function () {
    await stored.rawCollection().drop().catch(() => {});
  });

  it('readableBy selects what the user may read', async function () {
    await fc.assert(fc.asyncProperty(docs, viewer, followed, async (list, userId, publicIds) => {
      await store(list);
      const selector = readableBy(userId, publicIds);
      const expected = ids(list.filter(doc => readableModel(doc, userId, publicIds)));
      assert.deepEqual(ids(await stored.rawCollection().find(selector).toArray()), expected, 'MongoDB');
      assert.deepEqual(ids(await local.find(selector).fetchAsync()), expected, 'Minimongo');
    }), { numRuns, includeErrorInReport: true });
  });

  it('sharedWith selects what is shared with the user, public or not', async function () {
    await fc.assert(fc.asyncProperty(docs, user, async (list, userId) => {
      await store(list);
      const selector = { $or: sharedWith(userId) };
      const expected = ids(list.filter(doc => sharedWithModel(doc, userId)));
      assert.deepEqual(ids(await stored.rawCollection().find(selector).toArray()), expected, 'MongoDB');
      assert.deepEqual(ids(await local.find(selector).fetchAsync()), expected, 'Minimongo');
    }), { numRuns, includeErrorInReport: true });
  });
});
