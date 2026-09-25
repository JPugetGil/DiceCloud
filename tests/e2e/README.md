# Browser checks

Checks that drive a running DiceCloud development server in Chromium
(Playwright), signed in as a dedicated test account. They catch what the unit
tests (`meteor test`) cannot: pages that render nothing, a console error during
a real interaction, a dialog that fails to load, a form that shows the wrong
value, colours below the contrast they were chosen for.

Each check below covers a kind of bug found while migrating to Meteor 3 and
Vue 3 (see `implementation_plan_ui_fixes.md`).

## Setup

With the app running (`meteor` in `app/`, which also starts MongoDB on port
3001):

```sh
cd tests/e2e
meteor npm install                   # or npm install, with Node 18 or newer
meteor npx playwright install chromium   # once; skipped if already installed
meteor npm run setup                 # creates the e2e-tester accounts and their characters
```

`setup` registers two accounts through the app, the way the Register page does,
and creates a character for each with the app's own method: `e2e-tester`, which
the checks use, and `e2e-tester-other`, whose character the `actions` check must
fail to target. Re-running it keeps them.

## Running

```sh
meteor npm test                      # every check; exits non-zero if one fails
meteor node run-all.js routes flows  # only some of them
meteor npm run check:contrast        # one check, by its npm script
```

| Check | What it does | What it caught |
|-------|--------------|----------------|
| `routes` | Loads the main pages signed in and signed out (plus a public library and collection, and `E2E_EXTRA_ROUTES`); fails on a console error or warning, an empty page, "[object Promise]", or a subheader without its indent | Pages that did not mount; broken publications; card titles against the card's edge |
| `flows` | The health bar's layout, every character sheet tab, the speed dial, creating a property, editing it; then removes it | Forms that saved nothing; dialogs left open; a health bar squeezed to half the row |
| `actions` | An action may target the acting character but not one the user cannot edit; a skill check through its dialog; the Short rest button end to end; no log entry cut off | The check dialog failing as it opened; log entries clipped; guards the rule that replaced tabletop ids, under which any character id passed outside a tabletop (found in the code) |
| `docs-navigation` | Navigates the default docs inside the app and loads one directly | Documents that showed a title and no content after navigation |
| `property-forms` | Opens one library node of every property type in view and edit mode; checks select items, "false" values and console errors | Every select showing "false"; "[object Object]" options; a viewer that crashed |
| `dialogs` | Opens every lazily loaded dialog listed in `DialogComponentIndex.js` | Dialogs rendered as "[object Promise]" |
| `login-services` | Google buttons shown exactly when Google sign-in is configured | Buttons that only led to "Service not configured" |
| `contrast` | WCAG contrast of links, the selected toggle option and app bar text, in both themes (4.5:1 text, 3:1 icons) | Links and selected options below 4.5:1 |
| `palette` | Every theme colour role, as Vuetify applies it, against every surface of its theme and under its on- colour (see DESIGN_SYSTEM.md) | Brand red at 3.6:1 as text on dark cards |
| `accessibility` | axe-core's WCAG AA colour-contrast rule over the main pages, in both themes | Light-theme labels and subtitles at 4.3:1 |
| `slot-fill` | Opens a library slot in test mode and compares the fillers listed (and the "requirements not met" count) with what the database holds; skipped when the test account can use no library | Every slot fill dialog listing nothing ("Explore the Library!"); fillers offered although their requirements failed |

The server's own log can hold errors a clean browser console hides. Keep the dev
server's output (`meteor 2>&1 | tee /tmp/dicecloud-dev.log`) and run
`tools/server-log.sh /tmp/dicecloud-dev.log` after the checks.

## Tools

```sh
meteor node tools/screenshot.js /character/:character sheet --light --width 390
meteor node tools/dom.js /account '.theme-preference'
```

`:character` stands for the test account's character. Screenshots go to
`output/`, which git ignores.

## Configuration

| Variable | Default | |
|----------|---------|---|
| `E2E_BASE_URL` | `http://localhost:3000` | The app |
| `MONGO_URL` | `mongodb://127.0.0.1:3001/meteor` | Its database, read to find test data |
| `E2E_USERNAME` | `e2e-tester` | Must start with `e2e-` |
| `E2E_PASSWORD` | `e2e-tester-password` | |
| `E2E_ALLOW_REMOTE` | unset | `1` to allow a non-local app or database |
| `E2E_LOCALE` | unset (English) | Browser language, e.g. `fr` to run a check in French; checks that read English text (`slot-fill`) expect English |

## Safety

- The checks refuse to run against anything but a local app and database, unless
  `E2E_ALLOW_REMOTE=1`.
- They sign in only as an account whose name starts with `e2e-`, with its
  password; they never write login tokens or other data into the database.
- They read the database (to find the test character and sample library nodes)
  and change data only through the app, as a user would: `setup` creates the
  account and a character; `flows` creates a property and removes it again;
  `actions` takes a short rest with the test character; `contrast` sets the test
  account's theme preference to "Match device theme".
