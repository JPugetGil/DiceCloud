import { assert } from 'chai';
import fc from 'fast-check';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import type { TreeDoc } from '/imports/api/parenting/ChildSchema';
import { applyNestedSetProperties } from '/imports/api/parenting/parentingFunctions';
import { getFilter } from '/imports/api/parenting/treeFilters';
import { TREE_INDEX } from '/imports/api/parenting/treeIndexes';

/*
 * The tree filters, on random forests numbered as the app numbers them:
 * MongoDB (the server) and Minimongo (the pages) select exactly the
 * descendants and ancestors the parents give, never another root's; and the
 * tree index reads a subtree alone (bounded on `left` from both sides,
 * 2026-10-21: bounded below only, it read the rest of the tree)
 */
type Doc = TreeDoc & { _id: string };

// Each document's parent is an earlier one, or none: two roots, of up to 12
const parents = fc.array(fc.option(fc.nat(), { nil: undefined }), { minLength: 1, maxLength: 12 });
function forest(rootId: string, parentIndexes: (number | undefined)[]): Doc[] {
  const docs: Doc[] = parentIndexes.map((parent, i) => ({
    _id: `${rootId}-${i}`,
    root: { id: rootId, collection: 'tests' },
    ...i > 0 && parent !== undefined && { parentId: `${rootId}-${parent % i}` },
    left: i,
    right: i,
  }));
  applyNestedSetProperties(docs);
  return docs;
}

/** The model: the documents whose parents lead up to `doc` */
function isBelow(docs: Doc[], candidate: Doc, doc: Doc) {
  const byId = new Map(docs.map(each => [each._id, each]));
  for (let parent = byId.get(candidate.parentId as string); parent; parent = byId.get(parent.parentId as string)) {
    if (parent._id === doc._id) return true;
  }
  return false;
}
const ids = (list: { _id: string }[]) => list.map(doc => doc._id).sort();

if (Meteor.isServer) describe('Tree filters (properties)', function () {
  const numRuns = Number(process.env.FC_NUM_RUNS) || 100;
  this.timeout(30000 + numRuns * 30);
  const stored = new Mongo.Collection<Doc>('treeFiltersProperties');
  const local = new Mongo.Collection<Doc>(null);

  before(async function () {
    await stored.rawCollection().drop().catch(() => {});
    await stored.rawCollection().createIndex(TREE_INDEX.key);
  });
  after(async function () {
    await stored.rawCollection().drop().catch(() => {});
  });

  async function store(docs: Doc[]) {
    await stored.rawCollection().deleteMany({});
    await local.removeAsync({});
    await stored.rawCollection().insertMany(docs);
    for (const doc of docs) await local.insertAsync(doc);
  }
  async function bothSelect(selector: Mongo.Selector<Doc>, expected: string[], what: string) {
    assert.deepEqual(ids(await stored.rawCollection().find(selector).toArray()), expected, `${what}, MongoDB`);
    assert.deepEqual(ids(await local.find(selector).fetchAsync()), expected, `${what}, Minimongo`);
  }

  it('descendants, ancestors: what the parents give, in one root', async function () {
    await fc.assert(fc.asyncProperty(parents, parents, fc.nat(), async (first, second, pick) => {
      const docs = forest('one', first);
      const all = [...docs, ...forest('two', second)];
      await store(all);
      const doc = docs[pick % docs.length];
      await bothSelect(getFilter.descendants(doc), ids(docs.filter(each => isBelow(docs, each, doc))), 'descendants');
      await bothSelect(getFilter.ancestors(doc), ids(docs.filter(each => isBelow(docs, doc, each))), 'ancestors');
    }), { numRuns });
  });

  it('descendantsOfAll: those of each, in their root', async function () {
    await fc.assert(fc.asyncProperty(parents, parents, fc.uniqueArray(fc.nat(11), { minLength: 2, maxLength: 4 }), async (first, second, picks) => {
      const docs = forest('one', first);
      await store([...docs, ...forest('two', second)]);
      const chosen = [...new Set(picks.map(pick => docs[pick % docs.length]))];
      const expected = ids(docs.filter(each => chosen.some(doc => isBelow(docs, each, doc))));
      await bothSelect(getFilter.descendantsOfAll(chosen), expected, 'descendantsOfAll');
    }), { numRuns });
  });

  it('reads a subtree alone through the tree index', async function () {
    await fc.assert(fc.asyncProperty(parents, parents, fc.nat(), async (first, second, pick) => {
      const docs = forest('one', first);
      await store([...docs, ...forest('two', second)]);
      const doc = docs[pick % docs.length];
      const explained = await stored.rawCollection().find(getFilter.descendants(doc)).explain('executionStats');
      const { totalKeysExamined, nReturned } = explained.executionStats;
      assert.include(JSON.stringify(explained.queryPlanner.winningPlan), '"indexName":"root.id_1_left_1"');
      assert.isAtMost(totalKeysExamined, nReturned + 1, 'keys read beyond the subtree');
    }), { numRuns });
  });
});
