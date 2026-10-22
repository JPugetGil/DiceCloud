/**
 * Shared helpers for import.js and createCollection.js.
 *
 * These scripts talk to MongoDB directly and never load the app: since Meteor 3
 * and the Rspack bundler, `meteor shell` can no longer `require('/imports/...')`
 * (the server code lives inside the Rspack bundle), and the synchronous server
 * collection API the old shell scripts used is gone. The nested-set functions
 * below are ported from the app and name their source so the copies can be kept
 * in step with it; the parenting migration is this tool's own.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Borrowed from the app, like ddp.js borrows `ws`.
const { MongoClient } = require(
  process.env.MONGODB_PATH || path.join(__dirname, '../../app/node_modules/mongodb')
);

// The database `meteor run` starts next to a development server.
const DEFAULT_MONGO_URL = 'mongodb://127.0.0.1:3001/meteor';

// app/imports/constants/STORAGE_LIMITS.js, enforced there by the schemas that a
// raw insert bypasses.
const LIMITS = { name: 128, summary: 10000, libraryCollectionCount: 32 };

/**
 * `--flag value`, `--flag` (true) and `--no-flag` (false); everything else is
 * positional.
 */
function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const key = arg.slice(2);
    if (key.startsWith('no-')) { flags[key.slice(3)] = false; continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { flags[key] = true; continue; }
    flags[key] = next;
    i++;
  }
  return { flags, positional };
}

async function connect() {
  const url = process.env.MONGO_URL || DEFAULT_MONGO_URL;
  const client = await MongoClient.connect(url);
  // The database named in the URL (`meteor` for a development server)
  return { client, db: client.db(), url };
}

function readJson(file) {
  const raw = fs.readFileSync(file);
  return JSON.parse(file.endsWith('.gz') ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8'));
}

async function findOwner(db, username) {
  const owner = await db.collection('users').findOne({ username }, { projection: { username: 1 } });
  if (!owner) throw new Error(`no user named ${username} in this database`);
  return owner;
}

/**
 * Database version 2 -> 3 parenting for the given documents: `root` from the
 * first ancestor, `parentId` from `parent.id` when the parent is in the same
 * collection, and `left`/`right` seeded from `order` so the first nested-set
 * rebuild keeps sibling order.
 *
 * Only documents that have no `root.id` yet are touched, so re-running it is
 * harmless. The app no longer migrates databases, so there is no copy to keep
 * in step; the same mapping is applied to old character archives by
 * app/imports/migrations/archive/properties/migrateProperty2To3.js.
 */
function migrateParentingV2toV3(collection, filter) {
  return collection.updateMany({ ...filter, 'root.id': null }, [
    {
      $addFields: {
        root: { $arrayElemAt: ['$ancestors', 0] },
        parentId: {
          $cond: {
            if: { $eq: [collection.collectionName, '$parent.collection'] },
            then: '$parent.id',
            else: '$$REMOVE',
          },
        },
        left: '$order',
        right: '$order',
      },
    },
  ]);
}

/**
 * Port of `docsToForestByParentId` in app/imports/api/parenting/parentingFunctions.ts.
 * `docs` must already be in the order the forest should be built in.
 */
function docsToForestByParentId(docs) {
  const nodeIndex = {};
  docs.forEach(doc => {
    nodeIndex[doc._id] = { doc, children: [] };
  });
  const trees = [];
  const orphanIds = [];
  docs.forEach(doc => {
    const node = nodeIndex[doc._id];
    if (!doc.parentId) {
      trees.push(node);
    } else if (nodeIndex[doc.parentId]) {
      nodeIndex[doc.parentId].children.push(node);
    } else {
      // Parent is missing, unset it, and store orphan
      node.doc.parentId = undefined;
      orphanIds.push(node.doc._id);
      trees.push(node);
    }
  });
  return { trees, orphanIds, nodeIndex };
}

/**
 * Port of `calculateNestedSetOperations` in
 * app/imports/api/parenting/parentingFunctions.ts: walk the tree numbering
 * `left` on the way down and `right` on the way up. Expects `docs` sorted by
 * `left` ascending, and reverses them in place, as the original does.
 */
function calculateNestedSetOperations(docs) {
  const { trees: stack, orphanIds } = docsToForestByParentId(docs.reverse());
  const removeMissingParentsOp = orphanIds.length ? {
    updateMany: {
      filter: { _id: { $in: orphanIds } },
      update: { $unset: { parentId: 1 } },
    }
  } : undefined;
  const visitedNodes = new Set();
  const visitedChildren = new Set();
  const opsById = {};
  let count = 1;

  while (stack.length) {
    const top = stack[stack.length - 1];
    if (visitedNodes.has(top)) {
      console.warn('visited already, parent loop maybe?');
      stack.pop();
    } else if (visitedChildren.has(top)) {
      visitedNodes.add(top);
      stack.pop();
      if (top.doc.right !== count) {
        if (!opsById[top.doc._id]) {
          opsById[top.doc._id] = {
            updateOne: {
              filter: { _id: top.doc._id },
              update: { $set: { right: count } },
            }
          };
        } else {
          opsById[top.doc._id].updateOne.update.$set.right = count;
        }
      }
      count += 1;
    } else {
      visitedChildren.add(top);
      stack.push(...top.children);
      if (top.doc.left !== count) {
        opsById[top.doc._id] = {
          updateOne: {
            filter: { _id: top.doc._id },
            update: { $set: { left: count } },
          }
        };
      }
      count += 1;
    }
  }

  const operations = [...Object.values(opsById)];
  if (removeMissingParentsOp) operations.push(removeMissingParentsOp);
  return { operations, orphanIds };
}

/**
 * Port of `rebuildNestedSets` in app/imports/api/parenting/parentingFunctions.ts
 * (same query, same sort, same unordered bulk write).
 */
async function rebuildNestedSets(collection, rootId) {
  const docs = await collection.find({
    'root.id': rootId,
    removed: { $ne: true },
  }, {
    projection: { _id: 1, root: 1, parentId: 1, left: 1, right: 1 },
    sort: { left: 1 },
  }).toArray();
  const { operations, orphanIds } = calculateNestedSetOperations(docs);
  if (operations.length) await collection.bulkWrite(operations, { ordered: false });
  return { operations: operations.length, orphanIds };
}

/**
 * Checks what the publications and tree code rely on, for every node under
 * `rootId`: `left`/`right` present, each number used once across 1..2n,
 * `left < right`, and every node nested inside its parent's range.
 * Returns the number of nodes and the problems found.
 */
async function checkNestedSets(collection, rootId) {
  const docs = await collection.find(
    { 'root.id': rootId, removed: { $ne: true } },
    { projection: { _id: 1, parentId: 1, left: 1, right: 1 } }
  ).toArray();
  const problems = [];
  const byId = new Map(docs.map(d => [d._id, d]));
  const seen = new Set();
  for (const d of docs) {
    if (!Number.isInteger(d.left) || !Number.isInteger(d.right)) {
      problems.push(`${d._id}: left/right missing`);
      continue;
    }
    if (d.left >= d.right) problems.push(`${d._id}: left ${d.left} >= right ${d.right}`);
    for (const n of [d.left, d.right]) {
      if (seen.has(n)) problems.push(`${d._id}: number ${n} used twice`);
      seen.add(n);
    }
    const parent = d.parentId && byId.get(d.parentId);
    if (d.parentId && !parent) problems.push(`${d._id}: parent ${d.parentId} not in this tree`);
    if (parent && !(parent.left < d.left && d.right < parent.right)) {
      problems.push(`${d._id}: outside its parent's range`);
    }
  }
  if (!problems.length && seen.size) {
    let min = Infinity, max = -Infinity;
    for (const n of seen) { if (n < min) min = n; if (n > max) max = n; }
    if (min !== 1 || max !== seen.size) problems.push(`numbers are not 1..${seen.size}`);
  }
  return { nodes: docs.length, problems };
}

// Fields that describe a node's place or its computation, not its content:
// they differ between a snapshot and its import (parenting is migrated) and
// between a library node and the property a character copied from it
const NON_CONTENT_FIELDS = new Set([
  '_id', 'ancestors', 'parent', 'parentId', 'root', 'left', 'right', 'order',
  'parsed', 'hash', 'value', 'errors', 'effectIds', 'proficiencyIds',
  'parseLevel', 'libraryTags', 'tags', 'dirty', 'removed', 'removedAt',
  'removedWith', 'icon', 'parseNode', 'valueNode', 'parseError',
  'inlineCalculations', '_key', 'type',
]);

/**
 * A node's content as dotted paths to plain values (`amount.calculation`,
 * `weight`, `description.text`...), the fields a library edit changes.
 */
function contentFields(doc, prefix = '', out = {}) {
  if (doc === null || typeof doc !== 'object') {
    out[prefix] = doc;
    return out;
  }
  for (const [key, value] of Object.entries(doc)) {
    if (NON_CONTENT_FIELDS.has(key)) continue;
    contentFields(value, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

module.exports = {
  LIMITS,
  contentFields,
  parseArgs,
  connect,
  readJson,
  findOwner,
  migrateParentingV2toV3,
  calculateNestedSetOperations,
  rebuildNestedSets,
  checkNestedSets,
};
