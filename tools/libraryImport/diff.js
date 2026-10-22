/**
 * Compare the libraries a database holds with snapshots: does it need
 * `import.js --replace`? Read-only.
 *
 *   node diff.js <snapshot.json[.gz]>... [--examples 10]
 *
 * For each library of the snapshots: its nodes whose content differs in the
 * database (formulas, text, weights, names; not their place in the tree),
 * and those missing. A database that imported the libraries before the metric
 * conversion of 2026-09-29 shows thousands, with feet among the examples.
 */
const { parseArgs, connect, readJson, contentFields } = require('./lib');

const USAGE = 'usage: node diff.js <snapshot.json[.gz]>... [--examples <n>]';

async function main() {
  const { flags, positional: files } = parseArgs(process.argv.slice(2));
  if (!files.length) throw new Error(USAGE);
  const maxExamples = Number(flags.examples ?? 10);
  const { client, db, url } = await connect();
  console.log(`comparing with ${url.replace(/\/\/[^@]*@/, '//<credentials>@')}`);
  const LibraryNodes = db.collection('libraryNodes');
  const examples = [];
  let totalDiffering = 0;
  let totalMissing = 0;
  try {
    for (const file of files) {
      for (const { library, nodes } of readJson(file)) {
        const inDb = new Map();
        const cursor = LibraryNodes.find({ 'root.id': library._id });
        for await (const node of cursor) inDb.set(node._id, node);
        if (!inDb.size) {
          console.log(`  not imported      ${library.name}`);
          continue;
        }
        let differing = 0;
        let missing = 0;
        for (const node of nodes) {
          const dbNode = inDb.get(node._id);
          if (!dbNode) { missing++; continue; }
          const want = contentFields(node);
          const have = contentFields(dbNode);
          const changed = Object.keys(want).filter(key => want[key] !== have[key]);
          if (!changed.length) continue;
          differing++;
          if (examples.length < maxExamples) {
            const key = changed[0];
            examples.push(`${library.name} / ${node.name}: ${key} ${JSON.stringify(have[key])?.slice(0, 60)}`
              + ` -> ${JSON.stringify(want[key])?.slice(0, 60)}`);
          }
        }
        totalDiffering += differing;
        totalMissing += missing;
        console.log(`  ${String(differing).padStart(5)} differing  ${String(missing).padStart(5)} missing  ${library.name}`);
      }
    }
    console.log(`differing: ${totalDiffering}   missing: ${totalMissing}`
      + (totalDiffering || totalMissing ? '   -> refresh with import.js --replace' : '   -> up to date'));
    if (examples.length) console.log(`examples (database -> snapshot):\n  ${examples.join('\n  ')}`);
  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
