#!/usr/bin/env node
/**
 * Imports libraries pulled by pull.js into a DiceCloud database, owned by
 * `--owner` and listed in the community browse.
 *
 *   node import.js --owner <username> <snapshot.json[.gz]>...
 *     [--replace <libraryId>[,<libraryId>...] | --replace all] [--dry-run]
 *
 * A library that is already in the database is skipped, unless --replace names
 * it (or is `all`): its nodes are then swapped for the snapshot's (after the
 * snapshot was edited, say). Its owner, sharing and subscribers are kept.
 *
 * Talks to MongoDB directly (MONGO_URL, default: the development database of a
 * running `meteor run`) and never loads the app — see lib.js for why.
 *
 * There is one document per library, not a personal copy and a community copy.
 * Two publications read it (app/imports/api/library/server/publications/library.js):
 *
 *   'libraries'       everything `owner` owns  -> the Library page
 *   'browseLibraries' {public, showInMarket}   -> Browse community libraries
 *
 * so owning it and setting both flags puts each library on both pages.
 *
 * dicecloud.com serves database-version-2 documents (parent/ancestors/order).
 * The app is on version 3 (root/parentId/left/right), and every library
 * publication queries {'root.id': libraryId} -- so the nodes are migrated and
 * their nested sets rebuilt after insert, or the library browses as empty.
 */
const {
  LIMITS, parseArgs, connect, readJson, findOwner,
  migrateParentingV2toV3, rebuildNestedSets, checkNestedSets,
} = require('./lib');

const USAGE = 'usage: node import.js --owner <username> <snapshot.json[.gz]>... '
  + '[--replace <libraryId>[,<libraryId>...] | --replace all] [--dry-run]';

// Raw insert: these are still version-2 documents, which ChildSchema would
// reject for their missing `root`.
async function insertNodes(LibraryNodes, nodes) {
  for (let i = 0; i < nodes.length; i += 1000) {
    await LibraryNodes.insertMany(nodes.slice(i, i + 1000), { ordered: false });
  }
}

// The fields LibrarySchema + SharingSchema define. A raw insert skips
// collection2, so the document is built from them explicitly.
function libraryDocument(library, ownerId) {
  const doc = {
    _id: library._id, // every node points at it through ancestors[0]
    name: library.name,
    owner: ownerId,
    readers: [],
    writers: [],
    public: true,
    showInMarket: true,
    subscriberCount: 0,
  };
  if (library.description) doc.description = library.description;
  // LibrarySchema's `language` ('en' or 'fr') and `license` (libraryLicense.js),
  // when the snapshot says them
  Object.assign(doc, snapshotFields(library));
  return doc;
}

// The fields of LibrarySchema a snapshot may set besides its name and
// description: its language and its licence ('srd-5.1'...), with the note of
// another open licence
const SNAPSHOT_FIELDS = ['language', 'license', 'licenseNote'];
function snapshotFields(library) {
  return Object.fromEntries(SNAPSHOT_FIELDS.filter(key => library[key]).map(key => [key, library[key]]));
}

function checkLimits(library) {
  if (typeof library.name !== 'string' || !library.name) return 'has no name';
  if (library.name.length > LIMITS.name) return `name is over ${LIMITS.name} characters`;
  if (library.description && library.description.length > LIMITS.summary) {
    return `description is over ${LIMITS.summary} characters`;
  }
}

async function main() {
  const { flags, positional: files } = parseArgs(process.argv.slice(2));
  if (!flags.owner || !files.length) throw new Error(USAGE);
  const dryRun = !!flags['dry-run'];

  const payload = [];
  for (const file of files) {
    const batch = readJson(file);
    payload.push(...batch);
    console.log(`loaded ${batch.length} libraries from ${file}`);
  }
  for (const { library } of payload) {
    const problem = checkLimits(library);
    if (problem) throw new Error(`library ${library._id} ${problem}; nothing was written`);
  }
  if (flags.replace === true) throw new Error('--replace needs the ids of the libraries to replace, or all');
  const replace = new Set(flags.replace === 'all'
    ? payload.map(({ library }) => library._id)
    : flags.replace ? flags.replace.split(',').filter(Boolean) : []);
  for (const id of replace) {
    if (!payload.some(({ library }) => library._id === id)) {
      throw new Error(`--replace ${id}: no library with that id in the snapshots given`);
    }
  }

  const { client, db, url } = await connect();
  try {
    const Libraries = db.collection('libraries');
    const LibraryNodes = db.collection('libraryNodes');
    const owner = await findOwner(db, flags.owner);
    console.log(`${dryRun ? 'DRY RUN, nothing written -- ' : ''}importing ${payload.length} libraries `
      + `as ${owner.username} (${owner._id}) into ${url.replace(/\/\/[^@]*@/, '//')}`);

    const imported = [];
    for (const { library, nodes } of payload) {
      const present = await Libraries.findOne({ _id: library._id }, { projection: { _id: 1 } });
      if (present && !replace.has(library._id)) {
        console.log(`  SKIP ${library.name}: already present`);
        continue;
      }
      // Every node of the library, migrated to version 3 or not
      const nodeFilter = { $or: [{ 'root.id': library._id }, { 'ancestors.0.id': library._id }] };
      if (dryRun) {
        console.log(present
          ? `  would replace ${library.name}: ${await LibraryNodes.countDocuments(nodeFilter)} nodes -> ${nodes.length}`
          : `  would import ${library.name}: ${nodes.length} nodes`);
        continue;
      }
      if (present) {
        const previous = await LibraryNodes.find(nodeFilter).toArray();
        await LibraryNodes.deleteMany({ _id: { $in: previous.map(n => n._id) } });
        try {
          await insertNodes(LibraryNodes, nodes);
        } catch (e) {
          // Put the library back as it was
          await LibraryNodes.deleteMany({ _id: { $in: nodes.map(n => n._id) } });
          await insertNodes(LibraryNodes, previous);
          throw new Error(`${library.name}: ${e.message}; its previous nodes were put back, stopping`);
        }
        // The snapshot names and describes it; owner, sharing and subscribers stay
        await Libraries.updateOne({ _id: library._id }, library.description
          ? { $set: { name: library.name, description: library.description } }
          : { $set: { name: library.name }, $unset: { description: 1 } });
        const fields = snapshotFields(library);
        if (Object.keys(fields).length) await Libraries.updateOne({ _id: library._id }, { $set: fields });
        console.log(`  ${library.name}: ${previous.length} nodes replaced by ${nodes.length}`);
      } else {
        await Libraries.insertOne(libraryDocument(library, owner._id));
        try {
          await insertNodes(LibraryNodes, nodes);
        } catch (e) {
          // Leave nothing half-imported
          await Libraries.deleteOne({ _id: library._id });
          await LibraryNodes.deleteMany({ _id: { $in: nodes.map(n => n._id) } });
          throw new Error(`${library.name}: ${e.message}; rolled back, stopping`);
        }
        console.log(`  ${library.name}: ${nodes.length} nodes`);
      }
      imported.push({ library, nodeIds: nodes.map(n => n._id) });
    }
    if (dryRun || !imported.length) return;

    console.log('migrating parenting fields 2 -> 3');
    for (const { nodeIds } of imported) {
      await migrateParentingV2toV3(LibraryNodes, { _id: { $in: nodeIds } });
    }

    let orphanedParents = 0;
    for (const { library } of imported) {
      const { orphanIds } = await rebuildNestedSets(LibraryNodes, library._id);
      orphanedParents += orphanIds.length;
    }
    console.log(`rebuilt nested sets for ${imported.length} libraries`);

    console.log('verification:');
    let totalNodes = 0;
    let structurallyBad = 0;
    for (const { library, nodeIds } of imported) {
      const { nodes, problems } = await checkNestedSets(LibraryNodes, library._id);
      totalNodes += nodes;
      const missing = nodeIds.length - nodes;
      if (problems.length || missing) structurallyBad++;
      console.log(`  ${String(nodes).padStart(6)} visible${missing ? `, ${missing} NOT VISIBLE` : ''}`
        + `${problems.length ? `, ${problems.length} tree problems (${problems[0]})` : ''}  ${library.name}`);
    }
    console.log(`libraries: ${imported.length}   nodes: ${totalNodes}   `
      + `structurallyBad: ${structurallyBad}   orphanedParents: ${orphanedParents}`);
    if (structurallyBad) process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main().catch(e => {
  console.error(e.message);
  process.exitCode = 1;
});
