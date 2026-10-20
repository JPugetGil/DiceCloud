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
| `MONGO_URL` | The MongoDB database. On a replica set (one member is enough), Meteor 3.5 follows changes through change streams, so no oplog URL is needed; on a standalone server it polls the database instead, without a warning |
| `PORT` | The port the server listens on |
| `METEOR_SETTINGS` | The settings, as JSON |
| `MAIL_URL` | The SMTP server that sends password reset and email verification messages, such as `smtps://<user>:<password>@<server>:465`. Without it, the server prints those emails in its log |
| `MAIL_FROM` | Those messages' sender, such as `DiceCloud <no-reply@example.com>`: a domain the SMTP service has authenticated. Default: `no-reply@<the ROOT_URL host>` |
| `DEFAULT_LIBRARIES` | Comma-separated ids of the libraries new users are subscribed to |
| `DEFAULT_LIBRARY_COLLECTIONS` | Comma-separated ids of the library collections new users are subscribed to |
| `HTTP_FORWARDED_COUNT` | Behind proxies, how many: the visitor's address is then that many entries from the end of `X-Forwarded-For` (rate limits use it). `1` behind the Cloudflare tunnel of `deploy/` |

| Setting | |
|---------|---|
| `packages.service-configuration.google` | Google sign-in, see [Sign in with Google](#sign-in-with-google) |
| `discord` | DiceCloud's Discord application and the webhooks' key, see [Discord application](#discord-application) |
| `s3` | File storage, see [File storage (AWS S3)](#file-storage-aws-s3) |
| `public.legal` | Who runs the instance, see [Privacy policy and terms of use](#privacy-policy-and-terms-of-use) |
| `public.disallowCreatureApiImport` | `true` to turn off importing characters from another DiceCloud instance |
| `public.maintenanceMode` | `{ "reason": "<text>" }` sends everyone to a maintenance page showing the reason, but admins, who are sent to the administration page; signing in still works |

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
| `app/tests/components/` | The Vue components' tests (Vitest), with their configuration and the stubs of Meteor they render with |
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

The initiative tracker counts effect durations down: at the start of a
character's turn, its effects (buffs and conditions) that last some rounds lose
one, and end when none is left, which the character's log records. A duration
is read in rounds from the effect ("3", "1 minute", "1 turn"); on the board,
whoever may edit a character sets one on any of its conditions. Only the
characters the game master may edit are counted, and the game master can turn
counting off for the party (Count effect durations).

Library files
-------------

A library, or a library collection with its libraries, can be saved as a file
from its page (the download button), by whoever may copy it: its owner and
editors, admins, or anyone when it lets its readers copy it. Admins import such
files on the Library page (Import libraries), from this instance or another
one; the scripts of `tools/libraryImport` read and write the same libraries.
Libraries and their properties keep their ids, so the references between
libraries still hold: a library that is already here is skipped, unless the
admin chooses to replace it, which keeps its owner, sharing and subscribers.
New libraries belong to the admin, private unless they choose to share them.
Each library is sent on its own, so a file can hold a whole collection.

Tests
-----

`meteor npm test` in `app/` runs the unit tests (`*.test.js` and `*.test.ts`
files in `app/imports/`), next to a running development server if need be.
`MOCHA_GREP="<suite>"` runs the suites whose name matches.

Among them, the `*.property.test.ts` files test properties on random inputs
([fast-check](https://fast-check.dev/)): the formulas (the parser reads back
what it prints, the grammar is unambiguous, a compiled formula means what the
original did), the units (a value typed in feet reads back as typed), the
sharing selectors (MongoDB and Minimongo select exactly what the sharing rules
give) and the version rule (`deploy/version.sh` against a model of it). Each
runs a few hundred cases; `FC_NUM_RUNS=50000 meteor npm test` searches longer.
A failure prints the smallest input that fails and the seed that replays it.

`meteor npm run test:components` in `app/` tests Vue components
(`app/tests/components/*.spec.js`): Vitest renders them in happy-dom with the
app's Vuetify and translations, out of Meteor, in a few seconds, with no
server. A test clicks and types as a user does and reads what the component
shows and emits (a text field's save and its errors, the health bar's menu,
the About page's version). What a component imports from Meteor resolves to
`app/tests/components/stubs/`; a component that needs the server
(publications, methods) belongs to the browser checks below.

`meteor npm run typecheck` in `app/` type checks the app, single-file
components included (vue-tsc, about 35 s), once Meteor has built it (`meteor`
or `meteor npm test`). It fails on any error that `tests/types/baseline.txt`
doesn't list; that list, the backlog the check started with, is empty since
October 2026. `meteor npm run typecheck -- --update` rewrites it.

`meteor npm run cycles` in `app/` fails when the imports gain a cycle: a cycle
makes the order modules initialise in depend on which loads first, and has
crashed `meteor run` at startup while the tests and the build passed. The
imports already on a cycle are listed in `tests/cycles/baseline.txt`; after
removing some, `meteor npm run cycles -- --update` takes them out of it. It
needs `meteor npm ci` in `tests/cycles` first (madge, the tool it uses, lives
there).

GitHub Actions (`.github/workflows/ci.yml`) runs, on every push to `develop`
and every pull request: an audit of the production dependencies (high and
critical advisories), the lint, the import cycles check, the component tests,
the unit tests on the server and the type check.

`tests/e2e/` holds 28 Playwright checks that drive a running development
server: pages, the character sheet, action targets, docs navigation, every
property form, dialogs, login services, colour contrast (the theme palette and
an axe-core audit), the library dialogs, printed cards, Discord (webhooks,
sign-in, commands and buttons), monsters on a party board (initiative, turns,
targets, healing, undo, legendary actions, durations, repeated saves), the licences, the
account's screens and the actions on library nodes.
See [tests/e2e/README.md](tests/e2e/README.md).

Design system
-------------

DiceCloud follows Material Design, through Vuetify, with Material 3 colour roles
chosen for WCAG AA contrast. See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

Running with Docker
-------------------

The `Dockerfile` builds the app in this repository with Meteor and runs it on
Node 24.15.0, the version Meteor 3.5.2 builds with. [deploy/](deploy/README.md)
runs it in production on one machine with Docker Compose: the app, MongoDB 7.0
as a replica set of one, a Cloudflare tunnel and daily backups, all driven by
`deploy/dicecloud.sh`. Its README is the installation guide.

To run the image another way, give it `ROOT_URL`, `MONGO_URL` (a replica set:
on a standalone MongoDB, Meteor polls the database), `MAIL_URL`, and the
settings as JSON in `METEOR_SETTINGS`. To record which commit is running and
show its version, build with `--build-arg CONTAINER_VERSION=$(git rev-parse
--short=8 HEAD)`, `--build-arg APP_VERSION=$(deploy/version.sh)` and
`--build-arg APP_COMMIT_DATE=$(git log -1 --format=%cI)` (see Versions).

Versions
--------

The version DiceCloud shows (at the bottom of the side menu, and on the About
page with its commit and date) is read from the commits by `deploy/version.sh`:
the commit that added the script is 3.0.0, and after it each commit whose
subject starts with `Feat:` raises the minor version (3.1.0), each `Fix:` the
patch (3.1.1), and a `!` before the colon (`Feat!:`) the major version (4.0.0).
A scope is allowed (`fix(actions):`) and the case is not checked; other
commits (`Chore:`, `Refactor:`, `Test:`, merges) change nothing. Nothing is
bumped by hand: deploying a new feature commit shows a new version.

The image holds no git history: `deploy/dicecloud.sh start` runs the script on
the host and builds the image with the result (`APP_VERSION`). The development
server runs it in its clone. The commit hash the creatures' computations record
(`CONTAINER_VERSION`, `imports/constants/VERSION.js`) is a separate thing: it
still changes at every commit.

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

Discord application
-------------------

Characters and party boards can post to Discord with a pasted webhook URL
without any setting. With a Discord application, three more buttons appear,
and with its Public Key, slash commands on Discord:
"Connect to Discord" (a character's details, a party board), "Link my Discord
account" (account page, for the mentions on one's turn) and "Sign in with
Discord" (for an account already linked: it never creates one). Without the
application's settings, none of them shows and nothing else changes.

1. In the [Discord Developer Portal](https://discord.com/developers/applications),
   create the application under a **team** (Teams > New Team, then the
   application in it), not your personal account: deleting the application
   deletes every webhook it created, so it must outlive any one person. Name it
   without the word "discord" (Discord refuses it). Keep its client secret
   safe: a new one breaks nothing, a new application breaks every connection.
2. OAuth2 > Redirects: add `ROOT_URL` followed by `/discord/oauth/callback`,
   such as `https://dd-dc.hemoreg.me/discord/oauth/callback`, and
   `http://localhost:3000/discord/oauth/callback` for a development
   application (better a second application for development).
3. Put its client ID and secret in the server's settings (never in `public`):

   ```json
   {
     "discord": {
       "clientId": "<application id>",
       "clientSecret": "<client secret>",
       "publicKey": "<public key>",
       "botToken": "<bot token>",
       "tokenKey": "<openssl rand -base64 32>"
     }
   }
   ```

   `publicKey` turns the commands on: see [Commands and buttons](#commands-and-buttons).
   `botToken` adds the bot: see [The bot](#the-bot).
   `tokenKey` encrypts the webhooks' tokens: see [The webhooks' key](#the-webhooks-key).

4. Restart the server.

DiceCloud keeps no Discord access token: the webhooks' tokens stay in the
server-only `discordWebhooks` collection, an account link keeps the Discord id
and name. The user's authorization of the application stays on Discord, which
makes "Sign in with Discord" one click (`prompt=none`); they remove it in
Discord's User Settings, Authorized Apps (the account page says so). Discord
asks an application to be verified beyond 100 servers: the administration page
counts the servers DiceCloud is connected to.

### Commands and buttons

With the application's **Public Key** too, Discord sends DiceCloud its slash
commands (`/roll`, `/check`, `/save`, `/hp`, `/character`, `/action`, and
`/connect`, which needs the bot; in French `/jet`, `/test`, `/sauvegarde`,
`/pv`, `/personnage`, `/action`, `/connecter`) and the clicks on its buttons
(reroll with advantage or disadvantage, next turn, end my turn), over HTTP: no
bot runs. Only for accounts that linked their Discord account. The reroll
buttons go under a command's check, saving throw or roll of one d20, and under
the checks and saving throws made in DiceCloud that a connected channel's
webhook posts (never a pasted webhook's: Discord refuses them there).

`/action` runs any action or spell of the sheet through menus its user alone
sees, in the sheet's order: the targets (during a fight the menu opens by
itself, the action's last targets preselected; outside one, the `target`
option), the spell slot, the ammunition, then each choice the action asks;
its rolls take the sheet's advantage (conditions, effects) unless the
`advantage` option sets it. The engine runs on the server only, as the Discord
user's account, with the checks a browser gets; between two menus the server
keeps the session for 15 minutes (`discordActionSessions`), and each click is
checked again. The result is posted in the channel, for its user alone with
`secret` or for a game master's monster, as its players read it: never a
monster's numbers. More than 25 targets or options spread over up to four
selects of 25.

1. In the portal, Installation: Installation Contexts **Guild Install** and
   **User Install**; Install Link "Discord Provided Link"; for each context,
   the scope `applications.commands` alone (no `bot`). The Discord page of
   DiceCloud offers that link.
2. General Information: copy the **Public Key** into the settings,
   `discord.publicKey` (64 hexadecimal digits). It is not secret, but without
   it there is no endpoint and no command.
3. Restart, so that the server answers at `ROOT_URL/discord/interactions`
   (deploy first), then paste that address as **Interactions Endpoint URL**
   (General Information) and save: Discord checks it at once with a signed
   PING, and refuses the address if the server does not answer.
4. At startup the server registers the commands (all at once, replacing the
   application's global commands) with a client credentials token, scope
   `applications.commands.update`: no bot token, and it works for an
   application owned by a team. Only when their definitions changed: the
   administration page says when they were registered. In development, never
   to Discord itself unless `discord.registerCommands` is `true` (a
   development application); to the local fake of the e2e checks, always.

Behind Cloudflare, Discord's requests to `/discord/interactions` must reach the
server as they are: no challenge (Bot Fight Mode, a WAF rule, "Under Attack")
and no cache on that path.

To try them in development: a development application, its Public Key in
`settings.json` with `"registerCommands": true`, and a quick tunnel to the dev
server, `cloudflared tunnel --url http://localhost:3000`, whose
`https://<random>.trycloudflare.com/discord/interactions` is the development
application's Interactions Endpoint URL.

### The bot

With a bot token too, `discord.botToken`, DiceCloud's bot does two more things,
by HTTP alone (no process stays connected to Discord): "New session" in a text
channel, whatever connected it (Connect to Discord, `/connect`, a pasted
webhook), creates the session's public thread itself, in the channel the
webhook posts in; and `/connect` (`/connecter`), run in a text channel or in a
post of a forum by someone who may manage that channel's webhooks, connects it
to a party they lead or a character they may edit, with a webhook the bot
creates there: a forum so connected has its sessions as posts, with the
buttons. The bot reads no message and posts none itself.

A session is a forum's post or, in a text channel, the bot's thread: there is
no other way. "Resume a session" goes back into one of the last ten sessions
DiceCloud opened in the channel connected now (kept on the server for the game
master or the character's editors), with a short "The session goes on" that
reopens an archived thread; a deleted thread leaves the list.

1. In the portal, Bot: **Reset Token**, into `settings.json` as
   `discord.botToken` (secret, server-only). Leave **Requires OAuth2 Code
   Grant** off, and the privileged intents off: DiceCloud needs none.
2. Installation > Default Install Settings > **Guild Install**: scopes
   `applications.commands` and `bot`, permissions **View Channels**, **Manage
   Webhooks**, **Create Public Threads** and **Send Messages in Threads**
   (309774517248). User Install stays `applications.commands` alone. The
   Discord page of DiceCloud then offers "Add DiceCloud to a server" with
   exactly these, and "Install on my account".
3. A server's administrator adds DiceCloud with that link: a member named
   after the application appears, with a role holding the four permissions.
   Restart DiceCloud after setting the token, so that it reads it. The
   commands need no new registration: `/connect` is registered with the
   others, and until the token is set it answers that the bot is missing.

Without the token, "Connect to Discord", pasted webhooks and the forums'
sessions work as before, but a text channel takes no session: "New session"
says to use a forum.

### The webhooks' key

The webhooks' tokens, connected or pasted on a character or a party board, are
stored encrypted (AES-256-GCM) when the settings hold a key,
`discord.tokenKey`, with or without a Discord application. Without it they are
stored in plaintext, as before, and the server says so once at startup.

- **Make it** once: `openssl rand -base64 32` (32 random bytes in base64), into
  the server's settings, never in `public`:

  ```json
  { "discord": { "tokenKey": "<the 44 characters>" } }
  ```

  At the next start, the server encrypts what is stored in plaintext; the log
  says how many. It does so at every start, and finds nothing more to do.
- **Keep it** in the settings file and in a password manager. It is never in
  the database, so a dump or a backup (`deploy/dicecloud.sh backup`, its copy to
  S3) holds no webhook anyone could post with; keep the key out of those
  backups too.
- **Restoring** a dump needs the same key. Without it, the server keeps the
  encrypted values but cannot use them (it says how many at startup): every
  character, board and channel has to be connected or pasted again.
- **A new key**: put the old one in `discord.oldTokenKeys` (a list) and the new
  one in `discord.tokenKey`; the next start encrypts everything again with the
  new one, then the old one can go.

File storage (AWS S3)
---------------------

Uploaded images and character archives go to an S3 bucket when the settings
hold its credentials; otherwise they stay on the server's disk, inside the
container with Docker, which `deploy/`'s `start` and `update` recreate: they
are lost. The bucket is private:
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

The texts describe this code base and its hosting: a server in France behind a
Cloudflare tunnel, AWS S3 in Paris, Brevo for the emails, Google sign-in and
Discord. Review them, and update `LAST_UPDATED` in both files, whenever that
changes.
