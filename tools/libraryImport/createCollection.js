#!/usr/bin/env node
/**
 * Groups a snapshot's libraries into one library collection, owned by `--owner`
 * and listed in the community browse. Run after import.js.
 *
 *   node createCollection.js --owner <username> --manifest <manifest.json>
 *     [--id <id>] [--name <name>] [--description <markdown> | --no-description]
 *     [--keep-libraries-in-browse] [--dry-run]
 *
 * Talks to MongoDB directly (MONGO_URL, default: the development database of a
 * running `meteor run`) and never loads the app — see lib.js for why.
 *
 * The collection keeps the manifest's id, so re-running updates it in place.
 * Its member libraries stop being browse cards of their own: the collection
 * becomes the only one (pass --keep-libraries-in-browse to keep theirs). They
 * stay `public`, which is all the `libraryCollection` publication needs to
 * open them through the collection.
 */
const { LIMITS, parseArgs, connect, readJson, findOwner } = require('./lib');

const USAGE = 'usage: node createCollection.js --owner <username> --manifest <manifest.json> '
  + '[--id <id>] [--name <name>] [--description <markdown> | --no-description] '
  + '[--keep-libraries-in-browse] [--dry-run]';

// Used when neither the command line nor the manifest gives a description.
// Rendered as markdown (MarkdownText.vue: marked, then DOMPurify).
const DEFAULT_DESCRIPTION = `**The Official Collection for the Libraries of Vexus!**

If you want more 5e than what the default SRD offers, subscribe to this library!

- All races from all 5e sourcebooks!
- All 13 classes!
- All subclasses!
- All backgrounds!
- At least 97% of the spells!
- A lot of feats!
- A lot of wild shapes!
- A lot of magic items!
- A built in tutorial for how to use the library!
- A consistent style, focused on full automation of as many things as possible.
- Works with the Avrae importer for as many things as possible.

If you have any questions or if you find a bug, please tell us about it on our [official Discord](https://discord.gg/z3FRWzr63B)!

Before reporting a bug, please make sure you’ve read through **#getting-started** and **#your-first-character** on the [LoV Discord](https://discord.gg/z3FRWzr63B).`;

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (!flags.owner || !flags.manifest) throw new Error(USAGE);
  const dryRun = !!flags['dry-run'];
  const hideMembers = flags['keep-libraries-in-browse'] !== true;

  const manifest = readJson(flags.manifest);
  const collection = manifest.collection || {};
  const _id = typeof flags.id === 'string' ? flags.id : collection.id;
  const name = typeof flags.name === 'string' ? flags.name : collection.name;
  if (!_id || !name) throw new Error('the manifest has no collection.id/collection.name; pass --id and --name');
  if (name.length > LIMITS.name) throw new Error(`name is over ${LIMITS.name} characters`);

  // --description beats the manifest, and --no-description stores none
  const description = flags.description === false ? undefined
    : typeof flags.description === 'string' ? flags.description
      : collection.description || DEFAULT_DESCRIPTION;
  if (description && description.length > LIMITS.summary) {
    throw new Error(`description is ${description.length} characters, over the ${LIMITS.summary} limit`);
  }

  // Libraries marked referenceOnly are imported only so that references into
  // them resolve; they are not members of the upstream collection. Grouping
  // them too gave a new character two rulesets to choose from, so none was
  // filled in automatically.
  const wanted = (manifest.libraries || []).filter(l => !l.referenceOnly).map(l => l.id);
  const referenceOnly = (manifest.libraries || []).filter(l => l.referenceOnly).map(l => l.id);
  if (!wanted.length) throw new Error(`${flags.manifest} lists no libraries`);

  const { client, db } = await connect();
  try {
    const Libraries = db.collection('libraries');
    const LibraryCollections = db.collection('libraryCollections');
    const owner = await findOwner(db, flags.owner);

    // Only group libraries that actually landed: a collection that names a
    // missing library renders an empty row on both pages.
    const present = (await Libraries.find({ _id: { $in: wanted } }, { projection: { _id: 1 } }).toArray())
      .map(l => l._id);
    for (const id of wanted) {
      if (!present.includes(id)) console.log(`  WARN ${id} is in the manifest but not in this database, leaving it out`);
    }
    if (!present.length) throw new Error('none of the manifest libraries are in this database -- run import.js first');
    if (present.length > LIMITS.libraryCollectionCount) {
      throw new Error(`${present.length} libraries exceeds the limit of ${LIMITS.libraryCollectionCount} per collection`);
    }
    // Keep the manifest's order, which is the order the collection lists them in
    const libraries = wanted.filter(id => present.includes(id));

    // The fields LibraryCollectionSchema + SharingSchema define
    const fields = {
      name,
      libraries,
      owner: owner._id,
      readers: [],
      writers: [],
      public: true,
      showInMarket: true,
    };
    if (description) fields.description = description;

    const existing = await LibraryCollections.findOne({ _id }, { projection: { _id: 1 } });

    if (dryRun) {
      console.log('DRY RUN -- nothing written');
      console.log(`  would ${existing ? 'update' : 'create'} collection ${_id} (${name})`);
      console.log(`  owner ${owner.username} (${owner._id}), ${libraries.length} libraries`);
      console.log(`  description ${description ? `${description.length} characters` : 'unset'}`);
      if (hideMembers) {
        const wouldHide = await Libraries.countDocuments({ _id: { $in: libraries }, showInMarket: true });
        console.log(`  would clear showInMarket on ${wouldHide} libraries`);
      }
      if (referenceOnly.length) console.log(`  would leave out ${referenceOnly.length} reference-only libraries`);
      return;
    }

    if (existing) {
      // Not subscriberCount: that is real data once anyone has subscribed.
      const update = { $set: fields };
      if (!description) update.$unset = { description: 1 };
      await LibraryCollections.updateOne({ _id }, update);
      console.log(`updated collection ${_id} (${name})`);
    } else {
      await LibraryCollections.insertOne({ _id, subscriberCount: 0, ...fields });
      console.log(`created collection ${_id} (${name})`);
    }
    console.log(`  owner ${owner.username} (${owner._id}), ${libraries.length} libraries`);

    if (hideMembers) {
      const { modifiedCount } = await Libraries.updateMany(
        { _id: { $in: libraries }, showInMarket: true },
        { $set: { showInMarket: false } }
      );
      console.log(`  cleared showInMarket on ${modifiedCount} libraries`);
    }

    // Reference-only libraries keep the state import.js gives them: listed on
    // their own. Setting it here also undoes an earlier run that grouped them.
    if (referenceOnly.length) {
      const { modifiedCount } = await Libraries.updateMany(
        { _id: { $in: referenceOnly }, showInMarket: { $ne: true } },
        { $set: { showInMarket: true } }
      );
      console.log(`  ${referenceOnly.length} reference-only libraries left out of the collection`
        + `${modifiedCount ? ` (${modifiedCount} listed on their own again)` : ''}`);
    }

    // The queries the publications in app/imports/api/library/server/publications/library.js run
    console.log('verification:');
    const doc = await LibraryCollections.findOne({ _id });
    const resolved = await Libraries.countDocuments({ _id: { $in: doc.libraries } });
    const onLibraryPage = await LibraryCollections.countDocuments({
      _id, $or: [{ owner: owner._id }, { writers: owner._id }, { readers: owner._id }],
    });
    const inCommunityBrowse = await LibraryCollections.countDocuments({ _id, showInMarket: true, public: true });
    const memberCards = await Libraries.countDocuments({
      _id: { $in: doc.libraries }, showInMarket: true, public: true,
    });
    const openThroughCollection = await Libraries.countDocuments({ _id: { $in: doc.libraries }, public: true });
    const wantedCards = hideMembers ? 0 : doc.libraries.length;

    console.log(`  ${resolved} of ${doc.libraries.length} listed libraries resolve`);
    console.log(`  Library page ('libraries'):            ${onLibraryPage ? 'yes' : 'NO'}`);
    console.log(`  Browse community ('browseLibraries'):  ${inCommunityBrowse ? 'yes' : 'NO'}`);
    console.log(`  member library cards in browse:       ${memberCards} (want ${wantedCards})`);
    console.log(`  members open through the collection:   ${openThroughCollection} of ${doc.libraries.length}`);

    const ok = resolved === doc.libraries.length && onLibraryPage && inCommunityBrowse
      && memberCards === wantedCards && openThroughCollection === doc.libraries.length;
    console.log(ok ? 'collection is complete and visible on both pages' : 'SOMETHING IS WRONG, see above');
    if (!ok) process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main().catch(e => {
  console.error(e.message);
  process.exitCode = 1;
});
