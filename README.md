DiceCloud
========

DiceCloud is a free, auditable, real-time character sheet for D&D 5e.

This repository, [JPugetGil/DiceCloud](https://github.com/JPugetGil/DiceCloud),
runs the instance at [dd-dc.hemoreg.me](https://dd-dc.hemoreg.me/). It is a
fork of [ThaumRystra/DiceCloud](https://github.com/ThaumRystra/DiceCloud),
moved to Meteor 3 and Vue 3, with an English and a French interface.

Philosophy
----------

Setting up your character on DiceCloud takes a little longer than
just filling it in on a paper character sheet would. The goal of using an
online sheet is to make actually playing the game more streamlined, and
ultimately more fun. So putting a little extra effort into setting up a
character now pays off over and over again once you're playing.

The idea is to track where each number comes from, and allow you to easily make
changes on the fly. Let's look at a hypothetical example.

> You need to swim through a sunken section of dungeon to fetch the quest's Thing.
> You'll need to take off your magical Plate Armor of +1 Constitution to swim
> without sinking, of course.
>
> Taking it off will take away that disadvantage on
> stealth checks, change your armor class, your speed and your constitution, and
> which in turn changes your hit points and your constitution saving throw.
> Working out all those changes in the middle of a game will drag the game to a
> halt.
>
> Fortunately you have DiceCloud, so it's a matter of dragging
> your Plate Armor +1 Con from your "equipment" box to your "backpack" box and
> you're done. Your hitpoints change correctly, your saving throws are up to date,
> your armor class goes back to reflecting the fact that you have natural armor
> from being a dragonborn. Your character sheet keeps up and you
> ultimately get more time to play the game. Huzzah!

Getting started
---------------

Running DiceCloud locally, either to host it yourself away from an internet
connection, or to contribute to developing it further, is fairly
straightforward and it should work on Linux, Windows, and Mac.

You'll need to have installed:

- [git](https://www.atlassian.com/git/tutorials/install-git)
- [Meteor](https://www.meteor.com/install)

Meteor brings its own Node.js: Meteor 3.5.2, which this app uses, runs Node 24
(24.15.0) with npm 11. Run npm through `meteor npm` so that packages are
installed with the same versions.

Then, it's just a matter of cloning this repository into a folder, and running
`meteor` in the app directory.

`git clone https://github.com/JPugetGil/DiceCloud dicecloud`  
`cd dicecloud`  
`cd app`  
`meteor npm install`  
`meteor`

You should see this:

```
=> Started proxy.
=> Started MongoDB.
=> Compiled Rspack server app:
=> Started Rspack HMR server at http://localhost:8080/
=> Started your app.
=> App running at http://localhost:3000/
```

[http://localhost:3000/](http://localhost:3000/) then shows an empty instance of
DiceCloud.

Configuration
-------------

A server reads its configuration from environment variables and from its
settings, a JSON document. Locally, copy `app/exampleMeteorSettings.json` to
`app/settings.json` (which git ignores), keep the sections you need, and run
`meteor npm run serve` from `app/`. In production, pass the same JSON in
`METEOR_SETTINGS`. Every section is optional.

| Environment variable | |
|----------------------|---|
| `ROOT_URL` | The instance's public address, such as `https://dd-dc.hemoreg.me`: links in emails and Google sign-in use it |
| `MONGO_URL` | The MongoDB database. Meteor 3.5 follows changes through change streams, so no oplog URL is needed |
| `PORT` | The port the server listens on |
| `METEOR_SETTINGS` | The settings, as JSON |
| `MAIL_URL` | The SMTP server that sends password reset and email verification messages, such as `smtps://<user>:<password>@<server>:465`. Without it, the server prints those emails in its log |
| `MAIL_FROM` | Those messages' sender, such as `DiceCloud <no-reply@example.com>`: a domain the SMTP service has authenticated. Default: `no-reply@<the ROOT_URL host>` |
| `DEFAULT_LIBRARIES` | Comma-separated ids of the libraries new users are subscribed to |
| `DEFAULT_LIBRARY_COLLECTIONS` | Comma-separated ids of the library collections new users are subscribed to |

| Setting | |
|---------|---|
| `packages.service-configuration.google` | Google sign-in, see [Sign in with Google](#sign-in-with-google) |
| `s3` | File storage, see [File storage (AWS S3)](#file-storage-aws-s3) |
| `public.legal` | Who runs the instance, see [Privacy policy and terms of use](#privacy-policy-and-terms-of-use) |
| `public.disallowCreatureApiImport` | `true` to turn off importing characters from another DiceCloud instance |
| `public.maintenanceMode` | `{ "reason": "<text>" }` sends everyone but admins to a maintenance page showing the reason |
| `galaxy.meteor.com.env` | Environment variables for a deployment to Galaxy (`meteor deploy --settings`) |

Project layout
--------------

The app follows Meteor 3's
[application structure](https://docs.meteor.com/tutorials/application-structure/):
the entry points only import the startup code, and everything else lives in
`app/imports/`, loaded when something imports it.

| Path | Holds |
|------|-------|
| `app/client/main.html`, `app/client/main.js` | Client entry: the page's head and body, then `imports/startup/client` |
| `app/server/main.js` | Server entry: `imports/startup/server` |
| `app/tests/main.js` | Test entry (`meteor test`): every `*.test.js` and `*.test.ts` in `imports/` |
| `app/imports/startup/` | Startup, run in order: `both/` loads collection2 and the schema options, then `client/` or `server/` (package configuration, then `register-api.js`) |
| `app/imports/api/<domain>/` | Each domain's collections, schemas and methods (creatures, library, users...), with its server-only code (publications, REST routes, cron jobs) in a `server/` folder |
| `app/imports/ui/` | The Vue app: `main.js` creates it, `App.vue` is its root and `router.js` its routes; `pages/` holds one component per route, next to `layouts/`, `components/` and a folder per feature; `plugins/` (Vuetify and its themes), `stores/` (Pinia), `composables/` (shared `use...` functions), `i18n/` and `stylesheets/` |
| `app/imports/parser/`, `app/imports/constants/`, `app/imports/migrations/` | The calculation parser, shared constants, and the migrations that bring older character archives and imported creatures up to the current schema |
| `app/public/`, `app/private/` | Files served as they are; files only the server reads (the default docs) |

Conventions:

- Components are single-file components with `<script setup>`, named in
  PascalCase with at least two words; pages end in `Page`.
- Inputs work with `v-model` (`modelValue` and `update:modelValue`). A component
  that needs to know whether its parent listens to one of its events declares
  that listener as a prop (`onChange`, `onClick`...): Vue keeps the listeners of
  declared events out of `$attrs`.
- Meteor's APIs are imported from their packages
  (`import { Meteor } from 'meteor/meteor'`) rather than used as globals;
  `meteor npm run lint` reports a missing import in JavaScript and Vue files.
- Server code uses the asynchronous collection and method APIs (`findOneAsync`,
  `updateAsync`, `callAsync`...).

User roles
----------

Every account has one of three roles, which the server enforces:

| Role | Characters | Libraries | File storage | Change roles |
|------|------------|-----------|--------------|--------------|
| Player | Up to 2 | Can subscribe, can't create libraries or collections | 25 MB | No |
| Active player | Up to 10 | Can subscribe, can't create libraries or collections | 100 MB | No |
| Admin | Unlimited | Can subscribe and create | 100 MB | Yes |

- New accounts, and accounts created before roles existed, are players.
- Every character a user owns counts towards their limit: created, restored from
  an archive or imported from another instance. Characters shared with them
  don't count, and archived characters don't either.
- File storage covers uploaded images and character archives, archiving a
  character included.
- A user moved to a lower role keeps what they have, but can't add characters
  or files until they are back under the new limits. Libraries they own, or can
  edit, stay editable.

Admins change roles on the Admin page (`/admin`, linked from the sidebar). An
admin can't change their own role, so there is always one left. To make the
first admin, add the role in the database, for instance with `meteor mongo`
while the app runs locally:

```js
db.users.updateOne({ username: '<username>' }, { $addToSet: { roles: 'admin' } })
```

The roles and their limits are defined in `app/imports/api/users/roles.ts`.

The Admin page also shows the storage: the S3 bucket's (see
[File storage (AWS S3)](#file-storage-aws-s3)), and the MongoDB database's, in
all and by collection, with how full the database server's disk is. The app's
database user reads these with its `readWrite` role, which includes the
`dbStats` and `collStats` actions.

Parties
-------

Any character folder is a party board (the board icon next to the folder): one
card per character, an initiative tracker, and actions for the whole table
(experience, short and long rests). Its owner is the game master. They invite
players with the link of the board's Players card; a player who opens it joins
with the characters they choose, which the game master may then edit. Everyone
at the table sees every party character's card and the tracker, live; players
type their own characters' initiative results and the game master runs the
rest. A player who leaves, or whom the game master removes, takes their
characters out, and the game master can no longer edit them. A new link
replaces the old one; turning it off keeps the players who joined.

Tests
-----

`meteor npm test` in `app/` runs the unit tests (`*.test.js` and `*.test.ts`
files in `app/imports/`), next to a running development server if need be.

`meteor npm run typecheck` in `app/` type checks the app once Meteor has built
it (`meteor` or `meteor npm test`). The app has a backlog of type errors, listed
in `tests/types/baseline.txt`: the check fails only on errors that list doesn't
hold. After fixing some, `meteor npm run typecheck -- --update` removes them
from it.

GitHub Actions (`.github/workflows/ci.yml`) runs the lint, the unit tests on the
server and the type check on every push to `develop` and every pull request.

`tests/e2e/` holds Playwright checks that drive a running development server:
pages, the character sheet, action targets, docs navigation, every property
form, dialogs, login services, and colour contrast (the theme palette and an
axe-core audit). See [tests/e2e/README.md](tests/e2e/README.md).

Design system
-------------

DiceCloud follows Material Design, through Vuetify, with Material 3 colour roles
chosen for WCAG AA contrast. See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

Running with Docker
-------------------

The `Dockerfile` builds the app in this repository with Meteor and runs it on
Node 24.15.0, the version Meteor 3.5.2 builds with. `docker-compose.yml` starts
it next to a MongoDB container: set `ROOT_URL` in it, and `MAIL_URL` to send
emails, then run `docker compose up --build`. Pass the settings in
`METEOR_SETTINGS`. To record which commit is running,
build with `--build-arg CONTAINER_VERSION=$(git rev-parse --short HEAD)`.

Sign in with Google
-------------------

The "Sign in with Google" and "Register with Google" buttons, and "Link Google
Account" on the account page, only appear once Google is configured on the
server. Until then, accounts use a username or email and a password.

1. In the [Google Cloud Console](https://console.cloud.google.com/), create an
   OAuth client ID of type **Web application**. Google asks you to set up the
   OAuth consent screen first if the project does not have one yet.
2. Add your instance's `ROOT_URL` as an **authorized JavaScript origin**, and
   `ROOT_URL` followed by `/_oauth/google` as an **authorized redirect URI**. For a
   local instance, that is `http://localhost:3000` and
   `http://localhost:3000/_oauth/google`. Each environment (local, staging,
   production) needs its own pair. Google's `redirect_uri_mismatch` error means
   the URI it received is not in that list: it must match `ROOT_URL` exactly,
   scheme (`https`), `www.` and all. Google's error page shows the URI it
   received under "error details".
3. Put the client ID and secret in the settings the server starts with. Meteor's
   `service-configuration` package reads them at startup:

   ```json
   {
     "packages": {
       "service-configuration": {
         "google": {
           "loginStyle": "popup",
           "clientId": "<client id>.apps.googleusercontent.com",
           "secret": "<client secret>"
         }
       }
     }
   }
   ```

   Locally, save this as `app/settings.json`, which git ignores, and run
   `meteor run --settings settings.json` from `app/`. In production, pass the same
   JSON in `METEOR_SETTINGS`. The secret stays on the server: browsers only
   receive the client ID.
4. Restart the server. The Google buttons appear on the sign-in, register and
   account pages.

Removing the configuration from the settings later does not switch Google off:
Meteor keeps it in the `meteor_accounts_loginServiceConfiguration` collection.
Delete the document whose `service` is `google` from that collection as well.

File storage (AWS S3)
---------------------

Uploaded images and character archives go to an S3 bucket when the settings
hold its credentials; otherwise they stay on the server's disk, which a
container platform such as Galaxy wipes on every deploy. The bucket is private:
the app reads the files itself and serves them to the browser.

```json
{
  "s3": {
    "key": "<access key id>",
    "secret": "<secret access key>",
    "bucket": "<bucket name>",
    "region": "eu-west-3"
  }
}
```

The server also takes this JSON, as `{ "s3": { ... } }`, from an `S3`
environment variable. `region` defaults to `eu-west-3` (Paris). `endpoint` is
only needed for an S3-compatible service other than AWS. The access key needs
`s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on
`arn:aws:s3:::<bucket name>/files/*`, and nothing else but the optional
`s3:ListBucket` below.

The Admin page shows the space the bucket takes, by top-level folder (the
app's `files/`, and anything else such as the database backups of
`deploy/`), and an estimate of what it costs a month. It lists the bucket, so
the key also needs `s3:ListBucket` on `arn:aws:s3:::<bucket name>`; without
it, the page only counts the app's files recorded in the database it is
connected to, and says so. The estimate counts the storage only, at the S3
Standard prices of Paris ($0.024 per GB and month for the first 50 TB): add
`"storagePricePerGB"` to `s3`, in USD, to use another price, for instance in
another region. Without S3 settings, the page shows what the files on the
server's disk would cost on S3.

Privacy policy and terms of use
-------------------------------

`/privacy` and `/terms` show the privacy policy and the terms of use, in
English and French (`app/imports/ui/legal/`). They name whoever runs the
instance and how to reach them, from the public settings; until both are set,
the pages show a warning.

```json
{
  "public": {
    "legal": {
      "operator": "<your name or organisation>",
      "contactEmail": "<contact address>"
    }
  }
}
```

The texts describe this code base and its hosting (Galaxy, MongoDB Atlas, AWS
S3 in Paris, Google sign-in). Review them, and update `LAST_UPDATED` in both
files, whenever that changes.
