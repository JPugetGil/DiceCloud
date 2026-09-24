DiceCloud
========

This is the repo for [DiceCloud](https://dicecloud.com).

DiceCloud is a free, auditable, real-time character sheet for D&D 5e.

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

`git clone https://github.com/ThaumRystra/DiceCloud dicecloud`  
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

Environmental Variables
-----------------------

```
MAIL_URL=smtp://<your smtp mail url>
METEOR_SETTINGS={ "public": { "environment": "production" } }
MONGO_OPLOG_URL=mongodb+srv://<your url for the oplog account of your mongo database>
MONGO_URL=mongodb+srv://<your url for the read/write account of your mongo database>
NPM_CONFIG_PRODUCTION=true
PROJECT_DIR=app
ROOT_URL=https://<url of your DiceCloud instance>
DEFAULT_LIBRARIES=<comma separated list of library ids that will be subscribed by default: "abc123,def456">
```

Run `meteor run --settings exampleMeteorSettings.json` to start the app with the example settings.

Now, visiting [http://localhost:3000/](http://localhost:3000/) should show you an
empty instance of DiceCloud running.

Browser checks
--------------

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
it next to a MongoDB container: set `ROOT_URL` and `MAIL_URL` in it, then run
`docker compose up --build`. Pass settings, including the Google sign-in
configuration below, in `METEOR_SETTINGS`. To record which commit is running,
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
   production) needs its own pair.
3. Put the client ID and secret in the settings the server starts with. Meteor's
   `service-configuration` package reads them at startup:

   ```json
   {
     "public": { "environment": "production" },
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
