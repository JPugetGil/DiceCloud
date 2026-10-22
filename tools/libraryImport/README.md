# Importing DiceCloud libraries from another instance

These scripts pull public libraries from a remote instance over DDP and insert
them here, and keep the snapshots below. The app itself now saves a library or
a collection as a file from its page, and admins import such files on the
Library page (main README, "Library files", `app/imports/api/library/
libraryFiles.js`); the scripts and the app read and write the same libraries,
ids included.

Lives outside `app/` on purpose — anything inside the Meteor app directory gets
bundled into the build.

```
ddp.js                           minimal DDP client (Node's built-in WebSocket)
pull.js                          fetch libraries from a remote instance -> json
import.js                        insert pulled json into a DiceCloud database
createCollection.js              group a snapshot's libraries into one collection
diff.js                          compare a database's libraries with snapshots (read-only)
refreshCharacters.js             update characters after import.js --replace
lib.js                           shared by the two above: MongoDB access, the
                                 version 2 -> 3 parenting migration, and the
                                 nested-set rebuild ported from the app
propertyFields.js                regenerates propertyFields.json from this repo's schemas
propertyFields.json              169 field names that pull.js asks the remote for
addFields/                       adds fields a pull missed to both snapshots (2026-10-06)
data/vexus-libraries.json.gz     snapshot: 23 libraries, 42,520 nodes (9.9 MB)
data/manifest.json               what that snapshot contains and where it came from
data/vexus-libraries.json-fr.gz  the same 23 libraries in French (own ids)
data/manifest-fr.json            its manifest, with its own collection
```

`import.js` and `createCollection.js` are plain Node scripts that write to MongoDB
directly. They run outside the app's lifecycle and never load its code — see
"Why not `meteor shell`" below.

## Reproduce the import

The scripts are in git; the snapshots of `data/` are not, their libraries
holding text outside the SRD. They are kept in the backups' bucket
(`./dicecloud.sh snapshots`, deploy/README.md, "The import kit on S3"). With
them in `data/`, go straight to step 2.

### 1. Pull (only if you want a fresh copy)

**Never pull into `data/`.** The snapshots there have been edited since the
pull of 2026-09-19 (metric units, the French translation, the character guide,
the fields added on 2026-10-06) and nothing regenerates them: pull into a
separate file, compare, and merge what you need (as `addFields/` does).

```sh
cd tools/libraryImport
OUT=/some/work/dir/libraries.json.gz meteor node pull.js --library \
  8weFtT657czESN8bc 2wuq3G9FM9bJ4sdsu 6zSDbwmiQvfccRWdw nAX82dWJvjYaqRiQf \
  hYPp44b6DvkgZkL2o EDBGcBPh2xsEvTvfh 5zTd6bhF3d3Sm6LF7 q3bchH48RefdQ2a3d \
  ieXqKuXqjCh7CR367 PTEofoSHE2C4wC6GJ ci2HXtHhC76KNCpsh znPKr5Ch2j9bXXeys \
  ucoxyLcQMaYTK8EG5 JErLNE9r6idDRwthC pTKQiZaLjqz4pR4xp rQZ42WPKCKxusZcgt \
  tnsf3YYnfkkcpF2Ec XN8oocE8cMmoREchj 9PSLiw6Ythj8T57NB WugQNXFRRvoDFJZfS \
  eYXJyyPFCf6Yajgz8 naZPcHB9y5KiZERkL 4TCnYiivCqGG8inpo
```

`.json` and `.json.gz` are both understood, for input and output. Every library
is checkpointed as it lands, so re-running resumes rather than restarting. Put
`OUT` somewhere that survives a reboot (not `/tmp`). `pull.js` needs Node 22 or
newer for its built-in WebSocket (`meteor node` is 24); `WS_PATH` points at a
copy of the `ws` package for an older Node.

The first 21 ids are the members of library-collection `jp6xTaHDZK4ELYzvN`
("Libraries Of Vexus"); the last two close the reference graph, and the
manifests mark them `"referenceOnly": true` (see step 3). To resolve a
collection id yourself you need to be logged in, because `libraryCollection`,
`libraries`, `browseLibraries` and `searchLibraryNodes` all early-return `[]`
when there is no `userId`:

```sh
DC_TOKEN='<Meteor.loginToken>' node pull.js --collection jp6xTaHDZK4ELYzvN
```

Get a token from a browser logged into the remote instance:
`localStorage.getItem('Meteor.loginToken')`. It grants full account access — log
out afterwards to invalidate it. Individual *public* libraries need no token.

### 2. Import into this instance

From `tools/libraryImport`, with both snapshots:

```sh
node import.js --owner jpugetgil \
  data/vexus-libraries.json.gz data/vexus-libraries.json-fr.gz
```

Any Node 18+ works (`meteor node` too). Add `--dry-run` to see what would be
imported without writing anything. The owner must already have an account.

The scripts connect to `MONGO_URL`, which defaults to
`mongodb://127.0.0.1:3001/meteor` — the database `meteor run` starts, so for a
development instance the app must be running (or at least its MongoDB). For any
other database, set `MONGO_URL` to the same value the app is deployed with. The
`mongodb` driver is borrowed from `app/node_modules`, where the app declares it
for these scripts (4.17.2, a development dependency; run `meteor npm install`
there first); `MONGODB_PATH` points elsewhere if needed (the production image's,
for `./dicecloud.sh libraries`).

A snapshot's library may also state its `language` ('en', 'fr') and its
`license` ('srd-5.1'..., see `app/imports/api/library/libraryLicense.js`), with
a `licenseNote` for another open licence: `import.js` copies them on a first
import and on `--replace` (the SRD 5.1 bestiaries are 'srd-5.1').

Imported libraries are owned by `--owner`, with `public` and `showInMarket` both
forced true, which puts each of them on **two** pages at once:

| page | publication | matches on |
| --- | --- | --- |
| Library | `libraries` (`library.js:105`) | `owner` |
| Browse community libraries | `browseLibraries` (`library.js:156`) | `public` **and** `showInMarket` |

(`library.js` is `app/imports/api/library/server/publications/library.js`.)

There is one document per library, not a personal copy and a community copy --
both pages read the same record, so `owner` keeps it in their own library while
everyone can find it in the community browse. Libraries already present are
skipped, so the import is idempotent (and a re-run will *not* re-apply the flags
to a library that is already there).

For both snapshots, expect:

```
libraries: 46   nodes: 85040   structurallyBad: 0   orphanedParents: 0
```

#### Updating libraries that are already imported

A library already in the database is skipped, so editing a snapshot changes
nothing on an instance that imported it before. Name the libraries to refresh
with `--replace` (comma-separated ids, from the manifests), or refresh them all
with `--replace all`:

```sh
node import.js --owner jpugetgil --replace WugQNXFRRvoDFJZfS,hYPp44b6DvkgZkL2o,8weFtT657czESN8bc \
  data/vexus-libraries.json.gz
node import.js --owner jpugetgil --replace Za5w6P8QyKG8pStsW,KrkmzqgrKFqRcspH2,Cadj84PAE73GPQoTa \
  data/vexus-libraries.json-fr.gz
```

Each named library loses all its nodes and gets the snapshot's, which are then
migrated, rebuilt and checked like a fresh import; if the insert fails, its
previous nodes are put back. The library keeps its owner, sharing, flags and
subscribers, and takes the snapshot's name and description. Anything edited in
the app inside that library is lost. Characters keep what they already
inserted; new characters and new slot fills get the new content. `--dry-run`
shows the node counts before and after.

**Is a refresh needed?** `diff.js` compares the database with the snapshots,
read-only, and prints a few examples (database -> snapshot):

```sh
node diff.js data/vexus-libraries.json.gz data/vexus-libraries.json-fr.gz
```

`differing: 0   missing: 0` means up to date. A database that imported the
libraries before the metric conversion (2026-09-29) shows about 10,000 nodes,
with examples like `Darkvision: baseValue.calculation "60" -> "18"`.

**Characters.** `--replace` leaves characters as they are: one built from the
libraries in feet keeps its 30-foot speed. `refreshCharacters.js` updates them
in two steps around the replacement, so save before replacing:

```sh
node refreshCharacters.js --save backups/<date>-before.json.gz \
  data/vexus-libraries.json.gz data/vexus-libraries.json-fr.gz
node import.js --owner jpugetgil --replace all \
  data/vexus-libraries.json.gz data/vexus-libraries.json-fr.gz
node refreshCharacters.js --from backups/<date>-before.json.gz --dry-run
node refreshCharacters.js --from backups/<date>-before.json.gz
```

For every property a character copied from a library node (`libraryNodeId`),
it compares the saved node with the node now in the database and updates the
fields that changed, only where the character still holds the old value: a
value its owner edited is kept and listed. The characters it changes recompute
the next time their sheet opens. The saved file is also the backup of the old
nodes (about 20 MB for both snapshots); `backups/` is not tracked.

`structurallyBad` counts libraries with any node missing from its tree or any
broken nested set (numbers not exactly 1..2n, `left >= right`, a node outside its
parent's range). The script exits non-zero if it is not 0.

### 3. Group them into a collection

One run per manifest:

```sh
node createCollection.js --owner jpugetgil --manifest data/manifest.json
node createCollection.js --owner jpugetgil --manifest data/manifest-fr.json
```

Each creates one library collection -- named and id'd from `manifest.collection`,
so they keep `jp6xTaHDZK4ELYzvN` ("Libraries Of Vexus (5e2014)") and
`frVexusLibraries01` ("Bibliothèques de Vexus (5e2014)") -- holding every library
from the manifest that is actually present, in manifest order, except those
marked `referenceOnly`, and sets the same `public` + `showInMarket` pair, so the
collection is listed alongside them. The
description is the manifest's `collection.description` when it has one (both
manifests do: a "start here" and a map of the libraries), otherwise the
upstream English blurb. Descriptions render
as markdown -- `MarkdownText.vue` pipes them through `marked` and then DOMPurify
-- so bold, bullet lists and links all come out on the browse card and the
collection page. Override with `--id`, `--name` or `--description`, or pass
`--no-description` for none. The schema caps a description at 10,000 characters
(`STORAGE_LIMITS.summary`), which the script checks before writing; `--dry-run`
works here too.

The libraries inside it stop being browse entries of their own:

* **Library** page -- `LibraryList.vue` lists a library loose only when no
  collection claims it, so grouping nests them automatically.
* **Browse** -- the script clears `showInMarket` on each member, leaving the
  collection as the only card. Pass `--keep-libraries-in-browse` to keep their
  individual cards as well.

Clearing `showInMarket` costs nothing else: it is read only by the browse
listing (the `browseLibraries` publication). `public` stays set, and the
`libraryCollection` publication opens member libraries on `public` alone, so they
remain viewable and subscribable through the collection.

**Reference-only libraries stay out of the collection**, as upstream, where it
has 21 members. They are imported only so that references into them resolve, and
stay listed in browse on their own. Grouping them matters beyond looks: one of
them (*Tameran's Library of Newer and Slightly Different Things*) holds a second
"Character Base". A new character's Ruleset slot is filled automatically only
when exactly one ruleset matches (`insertDefaultRuleset` in
`app/imports/api/creature/creatures/methods/insertCreature.js`), so with both in
the collection none was.

Re-running updates the existing collection in place rather than making a second
one, and leaves its `subscriberCount` alone. The schema caps a collection at 32
libraries (`STORAGE_LIMITS.libraryCollectionCount`).

## Things that will bite you

**The remote is on an older database version.** dicecloud.com serves
**version 2** documents — `parent`, `ancestors`, `order`. All 42,522 nodes
arrived with no `root`, `parentId`, `left` or `right`. This instance is on
**version 3** (nested sets) and every library publication queries
`{'root.id': libraryId}`. Insert the documents unchanged and *none* of them are
visible: the library browses as completely empty.

`import.js` therefore inserts the nodes raw — collection2 would reject documents
with no `root`, which `ChildSchema` requires — then migrates exactly the nodes it
inserted (`migrateParentingV2toV3` in `lib.js`, one aggregation-pipeline
`updateMany` over the nodes that still have no `root.id`):

| version 3 field | set from the version 2 fields |
| --- | --- |
| `root` | `ancestors[0]`, the library (`{ id, collection: 'libraries' }`) |
| `parentId` | `parent.id` when `parent.collection` is `libraryNodes`; left unset for a top-level node, whose parent is the library itself |
| `left`, `right` | both `order`, so the rebuild that follows keeps sibling order |

The version 2 fields stay on the documents; nothing reads them. It then rebuilds
each library's nested sets, which renumbers `left`/`right` as 1..2n, and verifies
that every inserted node matches `{'root.id': id}` and that each library's tree is
well formed.

The app itself no longer migrates databases in place — every instance starts on
version 3 — so this migration exists only here. The same mapping survives in the
app for old character archive files, `migrateProperty2To3` in
`app/imports/migrations/archive/properties/`: if the app's parenting fields ever
change, that is where it will show.

**Never let a rate limit look like a missing feature.** The remote rate-limits
DDP hard. An early version of `pull.js` read "too many requests" as "the server
does not support `extraFields`" and fell back to one subscription *per node* —
3,762 requests in a burst. `pull.js` now retries on the delay the server asks
for and never falls through. Tune with `PACE` (ms between requests, default
2500) and `RETRIES` (default 5).

**Do not probe the remote for its field list.** `libraryNodes` only publishes
tree fields by default, but its `extraFields` parameter has no whitelist and
asking for a field a document lacks is a no-op in a Mongo projection. So
`propertyFields.json` — parsed from this repo's own property schemas — is sent
wholesale, and each library costs exactly **two subscriptions**. Regenerate it
if the schemas change, and check it is current before any pull:

```sh
meteor node propertyFields.js           # rewrites propertyFields.json, prints what changed
meteor node propertyFields.js --check   # writes nothing; exit code 1 if stale
```

`propertyFields.js` parses the schema files with the TypeScript compiler from
`app/node_modules` and takes the top-level keys of every object literal given
to `createPropertySchema(...)`, `TypedSimpleSchema.from(...)`,
`new SimpleSchema(...)` and `.extend(...)`, wherever it is indented. A name
too many costs nothing; a name too few loses that field for every node, which
is what happened until 2026-10-06 (next section).

**The first pull missed fields (fixed 2026-10-06).** The list used to come from
a regex that read only keys indented by exactly two spaces, in the top folder
of `properties/`, minus a list of SimpleSchema option names. Three holes:

* every field of `Spells.ts`, indented by four inside
  `.extend(TypedSimpleSchema.from({...}))`: `school`, `castingTime`, `range`,
  `verbal`, `somatic`, `material`, `concentration`, `ritual`, `prepared`,
  `alwaysPrepared`, `castWithoutSpellSlots`, `hasAttackRoll`. No imported spell
  had a school, casting time, range or components; spells meant to be cast
  without a slot (racial, item, Mystic Arcanum) used one, and none came
  prepared;
* `subSchemas/TagTargetingSchema.ts` (`targetByTags`, `targetField`), shared by
  effects, toggles, skills and proficiencies. Effects and skills that target
  properties by tag did nothing: the ability modifiers added to weapon attack
  and damage rolls ("Strength/Dexterity/Finesse Modifiers"), the weapon
  proficiency skills, toggles that switch tagged properties;
* `min` and `max` of point buys, dropped as if they were the SimpleSchema
  options of the same name.

The new list has 21 names more (also `color`, `_id`, `type`, which the
publication sends anyway, and a few names of nested or library-level schemas,
which match nothing) and 3 fewer (`nodeIndex`, `rateLimit`, `schema`, which were
not fields).

The missing fields were then added to both snapshots without touching anything
else, with `addFields/` (Python 3, no dependencies):

```sh
# 1. back up the snapshots and manifests (backups/<date>-before-merge-*)
# 2. pull the same 23 libraries into a work file with the new field list (step 1)
cd addFields
python3 merge.py /some/work/dir/libraries.json.gz            # dry run: what it would add
python3 merge.py /some/work/dir/libraries.json.gz --write    # adds the fields to data/*.gz
python3 verify.py ../backups/<date>-before-merge- --log /some/work/dir/merge-log.json
```

* `merge.py` adds, for the node types whose schema defines them (`FIELDS`),
  the fields a node lacks and the pulled node has; it never changes a field a
  node already has, and running it twice adds nothing. English nodes are
  matched by `_id`. French nodes by walking both trees in sibling order
  (`pairing.py`, as for the character guide): both snapshots have the same
  shape.
* English text fields (`castingTime`, `range`, `material`) go through
  `metric.py`, with the conventions of "Metric units" below: "60 feet" ->
  "18 meters", "Self (15-foot cone)" -> "Self (4.5-meter cone)", "1 mile" ->
  "1.5 kilometers", constants scaled inside inline calculations
  ("{60 * (1 + spellSniper)} feet" -> "{18 * (1 + spellSniper)} meters").
  Their capitalisation is upstream's ("action", "Action", "bonus action"...).
* French text fields are translated by `fr_tables.py`, one table per field,
  keyed by the English value: the official terms of the French 5e
  ("1 action bonus", "1 réaction, que vous prenez lorsque…", "Personnelle
  (cône de 4,5 m)", "Contact", "Champ de vision"; the components of the PHB FR
  where they exist), metres with a decimal comma and "m" (the majority form
  in the French spell texts). It stops on a value it has no translation for.
* `verify.py` compares the snapshots with their backup: same libraries, same
  nodes in the same order, no field changed, only fields of `FIELDS` added.

Result on 2026-10-06: 1,569 nodes completed in each language, 17,688 fields
(1,036 spells; 234 effects, 224 toggles, 59 skills, 2 proficiencies with
`targetByTags`; 14 point buys). Upstream changed meanwhile: 49 nodes of these
types no longer exist there (mostly the familiar toggles of Obediah's, Arianna's
and Stonewall's, and three Find Familiar spells) and were left as they were;
two spells recreated upstream under a new id with the same name took that
node's fields (`FALLBACK` in `merge.py`). The manifests record it under
`fieldsAdded`. A database that imported the libraries before needs
`--replace` (see "Updating libraries that are already imported"), and its
characters `refreshCharacters.js`: the fields a property lacks are added to it
as for any library change.

**Why not `meteor shell`.** These scripts used to be piped into `meteor shell` and
`require` the app's own modules. Since the app moved to Meteor 3 and its Rspack
bundler that cannot work: the server code lives inside the Rspack bundle, so
`require('/imports/...')` in the shell fails for every module; `Promise.await`
went with Fibers; and the synchronous server collection API (`findOne`, `insert`,
`count()`...) now throws. So the scripts write to MongoDB directly, and `lib.js`
carries the one piece of app logic they need, ported from the functions of the
same name in `app/imports/api/parenting/parentingFunctions.ts`:
`calculateNestedSetOperations` and `rebuildNestedSets`. Keep them in step if the
app's change. The port reproduces the app's own test fixtures
(`parentingFunctions.test.ts`) exactly.

The parenting migration beside them is the tool's own (see "The remote is on an
older database version" above): the app has no database migration left to port
it from.

**Writing directly skips the schemas.** Library and collection documents are
built field by field from `LibrarySchema`, `LibraryCollectionSchema` and
`SharingSchema`, and the length limits collection2 would enforce are checked
before anything is written. If those schemas gain required fields, add them here.

**Inserting from these libraries needs the app-side fix.** Until 2026-09 the app's
`insertPropertyFromLibraryNode` left every inserted copy rooted in its library, so
nothing inserted from a library appeared on the character, and content pulled in
through a `reference` node landed at the character's top level instead of where
the reference was. Both came from the nested-set migration (`e4590de3`) and are
fixed in the app; the Vexus libraries use references heavily (a Monk level 1
alone has three).

**Nine nodes have dead references.** Libraries `nemYFTRcYuLuRWxch` and
`MCbgoJHaHs2JNcn54` return "Internal server error" upstream — deleted, but still
named in cached refs. They affect 9 of 42,522 nodes, none in the core 21.

## Provenance

`data/` holds third-party community content authored by other people and
published on dicecloud.com. It is a snapshot for reproducing this import, not
original work of this project — see `data/manifest.json` for the source. The
collection's own description asks that you **unsubscribe from the SRD** if you
use it, since it is a replacement rather than a supplement.

The character-creation documentation differs from upstream, in both
languages, checked against this app on 2026-09-29:

* **Jon Evan's Introduction to the Library** (`WugQNXFRRvoDFJZfS` /
  `Za5w6P8QyKG8pStsW`). The three tutorial stages are rewritten: the whole
  journey up front, and no more links to beta.dicecloud.com collections that
  do not exist here. A new card, *Build Your First Character, Step by Step*,
  sits under the tutorial's post-tutorial toggle next to *Resummon Jon*: it
  stays at the top of the Build tab while the player builds, one feature per
  step (sources, ability scores, race, background, class, levels, spells,
  equipment, troubleshooting). The stage-1 topic that held the old guide (its
  screenshots showed the 2021 UI and a levelling procedure the Level Up dialog
  has replaced) now references that card instead. Anything inserted from
  stage 1 turns inactive as soon as the player moves on, which is why the
  guide cannot live there alone.
* **Tameran's Library of Everything** (`hYPp44b6DvkgZkL2o` /
  `KrkmzqgrKFqRcspH2`): the *READMETOO: YOUR FIRST CHARACTER* note described
  the 2021 setup (trash the SRD base, "Confirm Stats"); it is now a short start.
  Its *(!) General FAQ* topic no longer mentions v1, dicecloud.com or
  Patreon (those entries are gone; the character-limit, Avrae and duplication
  entries describe this app).
* **Obediah's Bag of Slot Fillers** (`8weFtT657czESN8bc` / `Cadj84PAE73GPQoTa`):
  the *Point Buy* method runs from 8 to 15. Its sliders ran from 0 to 100
  because the pull never asked for `min` and `max` (see "The first pull
  missed fields"): upstream sets the same 8 to 15.
* Every library: links to the collection and its libraries on dicecloud.com
  and beta.dicecloud.com point at this server (`BASE_URL` in
  `docs/content.py`, `https://dd-dc.hemoreg.me`), with each language's ids.
  Telam's Templates and Minimus Arcanum exist only on dicecloud.com, so
  their two links stay there.
* The library's own description, and in both manifests the collection
  description and the order of the libraries (Jon's first, then the core,
  races, classes by name, and the rest), which `createCollection.js` keeps.

The text and these edits were made by `docs/content.py` and
`docs/apply_docs.py`, which are no longer in this folder: the snapshots are
their own source now. Edit them directly, then `--replace` the libraries
changed.

Labels in the text are taken from the library they are written into, so the
French guide names the French cards.

### Metric units

Both snapshots measure distances in metres (`metric/convert.py`, run once on
2026-09-29 and no longer in this folder; the manifests say `"units": "metric"`,
and converting again would scale everything twice). Making the libraries
switchable was not practical: distances are computed in feet by ~130
attributes and ~400 effects and written in ~8,400 English sentences, so a
switch would mean an inline calculation per mention and a metric/imperial
branch in every formula. Instead (2026-10-01) everything stays metric and the
app converts for display: the Account page offers feet and pounds (D&D rules,
1.5 m = 5 ft, 1 lb = 0.5 kg) for computed values, item weights and weight
inputs (`app/imports/api/utility/units.ts`). Which attributes are distances
comes from their variable name (`DEFAULT_ATTRIBUTE_UNITS`, the `DISTANCES` set
below plus `carryingCapacity`) or their own `unit` field. Text stays metric.

* Conventions of the French edition: 5 ft = 1.5 m (x 0.3; under a metre,
  centimetres), 1 mile = 1.5 km, 1 inch = 2.5 cm, 1 cubic foot = 30 litres,
  1 square foot = 0.09 m2; results rounded to one decimal.
* Computed distances in both languages: speeds, senses, jump distances, light
  radii, reach and their wild-shape copies (the `DISTANCES` set). Formulas
  that define or change them go through a table; the script stops on one it
  does not know. Formulas multiply by `3 / 10`, never `0.3` (3 x 0.3 is
  0.8999... in JavaScript).
* English text: every distance written with a number, weapon ranges
  ("range 6/18 m"), and the rules that count feet ("every meter of movement
  costs an extra meter", "30 centimeters per point rolled"). The spell fields
  added on 2026-10-06 (range, casting time, material) follow the same rules
  (`addFields/metric.py`).
* French text was metric already, except inline calculations that printed
  feet ("pieds (1 pied = 30 cm)"): they now compute metres.
* `--dry-run --review` lists every distinct conversion by category.

Weights too (`metric/weights.py`, run once and no longer here; manifests `"weights": "metric"`):
1 lb = 0.5 kg as in the French edition, 1 ton = 1,000 kg, 1 ounce = 30 g (or
30 ml for a liquid). Every item's and container's weight in both languages,
carrying capacity (`strength * 7.5`), the encumbrance thresholds, the English
text and the French carrying rules that still said "livres". The app shows
weights in the user's unit (kg by default), and its default docs say kg.

Characters keep what they already inserted, in feet and pounds; new
characters and new slot fills get metres and kilograms. A database that
imported the libraries before the conversion still holds feet until
`--replace all` (the local one did until 2026-10-01; its character was patched
field by field from a backup, see `backups/`).
