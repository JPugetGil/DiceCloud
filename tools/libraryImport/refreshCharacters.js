/**
 * Bring characters up to date with libraries refreshed by `import.js
 * --replace`, which leaves characters as they were: a character built from
 * the libraries in feet keeps its 30-foot speed after they turn metric.
 *
 * Two steps around the replacement:
 *
 *   node refreshCharacters.js --save <before.json.gz> <snapshot.json[.gz]>...
 *     before --replace: saves the database's nodes of the snapshots' libraries
 *   node import.js --owner <username> --replace all <snapshot.json[.gz]>...
 *   node refreshCharacters.js --from <before.json.gz> [--dry-run]
 *     after: compares each saved node with the node now in the database, and
 *     updates the properties characters copied from it
 *
 * A property field is updated only where the character still holds the old
 * library value: a field its owner edited is kept, and listed. Characters
 * that changed are marked to recompute the next time their sheet opens.
 */
const fs = require('fs');
const zlib = require('zlib');
const { parseArgs, connect, readJson, contentFields } = require('./lib');

const USAGE = 'usage: node refreshCharacters.js --save <before.json.gz> <snapshot.json[.gz]>...\n'
  + '       node refreshCharacters.js --from <before.json.gz> [--dry-run]';

const get = (doc, path) => path.split('.').reduce((value, key) => value == null ? undefined : value[key], doc);
const short = value => JSON.stringify(value)?.slice(0, 60);

async function save(db, file, snapshots) {
  const libraryIds = snapshots.flatMap(snapshot => readJson(snapshot).map(({ library }) => library._id));
  const libraryNodes = await db.collection('libraryNodes').find({ 'root.id': { $in: libraryIds } }).toArray();
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify({ savedAt: new Date(), libraryIds, libraryNodes })));
  console.log(`saved ${libraryNodes.length} nodes of ${libraryIds.length} libraries to ${file}`);
}

async function refresh(db, file, dryRun) {
  const saved = readJson(file);
  const before = new Map(saved.libraryNodes.map(node => [node._id, node]));
  const libraryIds = [...new Set(saved.libraryNodes.map(node => node.root?.id).filter(Boolean))];
  const now = new Map();
  for await (const node of db.collection('libraryNodes').find({ 'root.id': { $in: libraryIds } })) {
    if (before.has(node._id)) now.set(node._id, node);
  }
  console.log(`${before.size} saved nodes, ${now.size} of them still in the database`);

  const CreatureProperties = db.collection('creatureProperties');
  const operations = [];
  const creatureIds = new Set();
  const kept = [];
  const examples = [];
  let fields = 0;
  let properties = 0;
  for await (const prop of CreatureProperties.find({ libraryNodeId: { $exists: true } })) {
    const oldNode = before.get(prop.libraryNodeId);
    const newNode = now.get(prop.libraryNodeId);
    if (!oldNode || !newNode) continue;
    const oldFields = contentFields(oldNode);
    const newFields = contentFields(newNode);
    const $set = {};
    for (const path of Object.keys(newFields)) {
      if (newFields[path] === oldFields[path]) continue;
      const current = get(prop, path);
      if (current === newFields[path]) continue;
      if (current === oldFields[path]) {
        $set[path] = newFields[path];
        if (examples.length < 15) examples.push(`${prop.name} · ${path}: ${short(current)} -> ${short(newFields[path])}`);
      } else {
        kept.push(`${prop.name} (${prop.root?.id}) · ${path}: ${short(current)}, library ${short(oldFields[path])} -> ${short(newFields[path])}`);
      }
    }
    properties++;
    if (!Object.keys($set).length) continue;
    fields += Object.keys($set).length;
    operations.push({ updateOne: { filter: { _id: prop._id }, update: { $set } } });
    if (prop.root?.collection === 'creatures') creatureIds.add(prop.root.id);
  }

  console.log(`${properties} properties come from those nodes: ${operations.length} to update`
    + ` (${fields} fields) on ${creatureIds.size} characters, ${kept.length} edited fields kept`);
  if (examples.length) console.log(`for example:\n  ${examples.join('\n  ')}`);
  if (kept.length) console.log(`kept, edited by their owner:\n  ${kept.join('\n  ')}`);
  if (dryRun) {
    console.log('DRY RUN, nothing written');
    return;
  }
  for (let i = 0; i < operations.length; i += 500) {
    await CreatureProperties.bulkWrite(operations.slice(i, i + 500), { ordered: false });
  }
  // A computeVersion that does not match the app's makes the sheet recompute
  // when it next opens
  await db.collection('creatures').updateMany(
    { _id: { $in: [...creatureIds] } },
    { $unset: { computeVersion: 1 } },
  );
  console.log(`updated ${operations.length} properties; ${creatureIds.size} characters recompute when opened`);
}

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  if (!!flags.save === !!flags.from || (flags.save && !positional.length)) throw new Error(USAGE);
  const { client, db, url } = await connect();
  console.log(`database ${url.replace(/\/\/[^@]*@/, '//<credentials>@')}`);
  try {
    if (flags.save) await save(db, flags.save, positional);
    else await refresh(db, flags.from, !!flags['dry-run']);
  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
