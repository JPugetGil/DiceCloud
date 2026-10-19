# Browser checks

Checks that drive a running DiceCloud development server in Chromium
(Playwright), signed in as a dedicated test account. They catch what the unit
tests (`meteor test`) cannot: pages that render nothing, a console error during
a real interaction, a dialog that fails to load, a form that shows the wrong
value, colours below the contrast they were chosen for.

Each check below covers a kind of bug found while migrating to Meteor 3 and
Vue 3.

## Setup

With the app running (`meteor` in `app/`, which also starts MongoDB on port
3001):

```sh
cd tests/e2e
meteor npm install                   # or npm install, with Node 20.19 or newer
meteor npx playwright install chromium   # once; skipped if already installed
meteor npm run setup                 # creates the e2e-tester accounts and their characters
```

`setup` registers two accounts through the app, the way the Register page does,
and creates a character for each with the app's own method: `e2e-tester`, which
the checks use, and `e2e-tester-other`, whose character the `actions` check must
fail to target, and which the `discord-webhook` check signs in as, to read the
test character as someone who may not edit it. Re-running it keeps them.

## Running

```sh
meteor npm test                      # every check; exits non-zero if one fails
meteor node run-all.js routes flows  # only some of them
meteor npm run check:contrast        # one check, by its npm script
```

| Check | What it does | What it caught |
|-------|--------------|----------------|
| `routes` | Loads the main pages signed in and signed out (plus a public library and collection, the printed sheet in both layouts, the printed cards, and `E2E_EXTRA_ROUTES`); fails on a console error or warning, an empty page, "[object Promise]", or a subheader without its indent | Pages that did not mount; broken publications; card titles against the card's edge |
| `flows` | The hit points heading the Stats tab (combat summary), every character sheet tab, the speed dial, creating a property, editing it, finding it through the character search, a condition chip on and off, the character list's search; then removes the property | Forms that saved nothing; dialogs left open; a health bar squeezed to half the row |
| `actions` | An action may target the acting character but not one the user cannot edit; a skill check through its dialog; the Short rest button end to end; no log entry cut off | The check dialog failing as it opened; log entries clipped; guards the rule that replaced tabletop ids, under which any character id passed outside a tabletop (found in the code) |
| `docs-navigation` | Navigates the default docs inside the app and loads one directly | Documents that showed a title and no content after navigation |
| `property-forms` | Opens one library node of every property type in view and edit mode; checks select items, "false" values and console errors; then one node of every type of the SRD 5.1 bestiary when it is imported (an action without `resources` first; edit mode where the test account may edit it) | Every select showing "false"; "[object Object]" options; a viewer that crashed; the action viewer crashing on a bestiary action imported without `resources` (production) |
| `dialogs` | Opens every lazily loaded dialog listed in `DialogComponentIndex.js`; the library node dialog with an action of the SRD 5.1 bestiary without `resources`, which must log nothing | Dialogs rendered as "[object Promise]"; a bestiary action's viewer crashing |
| `login-services` | Google buttons shown exactly when Google sign-in is configured | Buttons that only led to "Service not configured" |
| `contrast` | WCAG contrast of links, the selected toggle option and app bar text, in both themes (4.5:1 text, 3:1 icons) | Links and selected options below 4.5:1 |
| `palette` | Every theme colour role, as Vuetify applies it, against every surface of its theme and under its on- colour; then the 190 colours users pick from, under the text colour the app gives them (`onColor`, see DESIGN_SYSTEM.md) | Brand red at 3.6:1 as text on dark cards; white titles at 2.6:1 on light blue notes |
| `accessibility` | axe-core's WCAG 2.1 A and AA rules over the main pages, in both themes, at 1400 and 390 px; the Journal's coloured notes, title against card (axe cannot measure them under the hover highlight) | Light-theme labels and subtitles at 4.3:1; icon buttons without a name; zoom disabled on phones; tooltips and lists that screen readers found empty or invalid |
| `slot-fill` | Opens a library slot in test mode and compares the fillers listed (and the "requirements not met" count) with what the database holds, skipped when the test account can use no library; then the insert property dialog's Library tab lists a note of a library of the test account's, under the library's name (both inserted for the step, then removed), and its panel, expanded, offers to open the note's details | Every slot fill dialog listing nothing ("Explore the Library!"); fillers offered although their requirements failed; the insert property dialog breaking on any library node not imported from database version 2 (it read the library from `ancestors`); the details button, behind Vuetify 2's `open` slot prop, never shown |
| `print-cards` | Gives the test character a prepared spell and an item from a public library, then: the sheet's menu opens `/print-cards` with the spell among the default cards, the page lays out a spell card and an item card, no card shows a brace or overflows its body, the cards keep their title in print, the PDF has one A4 page per sheet, each card has its library's language, with backs every back sits opposite its front; removes them again; skipped without a public library holding both | Built with the printable cards: their header hidden in print by the app bar's `header { display: none }`; a layout run while printing (the character recomputed) that measured nothing and gave 28 pages for 8 sheets; a page opened from the menu that laid out no card |
| `discord-webhook` | Gives the test character a made-up Discord webhook (never called: its id is not a number; with the fake, the fake's, pasted in the character's form, which then shows "Webhook …0001"), shares it with `e2e-tester-other` as a reader and makes it public; then searches every DDP frame for the webhook's token and for a sealed value (`enc1.`): the editor's, which hold the webhook's id and never its URL, the reader's browser's and a signed-out visitor's, which hold neither, and the REST API's answer without a token; says whether the server stored it sealed; the public character's page carries its link preview (Open Graph, component embed of at most 3,000 bytes), nothing of it once private again. Against the local fake of Discord (below), also: a roll leaves as a Components V2 card with Discord's User-Agent; the character's "New session" in a text channel the bot cannot reach opens nothing (a forum's post tried, refused, no header message), says how to fix it and turns unavailable; with the bot (`botToken`), once it sees the channel, a thread the bot creates, which a roll goes into, then "Resume a session" reopening it once archived ("The session goes on") and taking it off the list once deleted; a party board with a forum webhook, which `e2e-tester-other` joins and whose players see what it posts but never its URL (both webhooks are pasted with the page's animation frames held back, as a busy tab does); a roll to both channels, the forum opening a post of its own; the board's "New session"; a fight's initiative message, which says it starts and is edited at each turn, the turn lines and the summary, never a monster's hit points; each of the game master's switches (initiative, turns, combat, rolls, sessions, and publishing as a whole). Puts everything back | The webhook URL published whole to every reader and, for a public character, to anyone through the REST API: with it, anyone could post in the channel or delete the webhook; now and then, a field animated after it had left the page ("scale(NaN)" warnings) |
| `discord-oauth` | Against the local fake of Discord, with a Discord application in the server's settings (else skipped): "Connect to Discord" for the test character and a party board through the fake's authorization page, one webhook for their shared channel, a roll posted with it; the board's "New session" in a thread the bot creates in that channel (without the bot, unavailable and explained), a roll posted into the thread, the thread deleted in the fake and the next roll back in the channel (as in Discord, an archived thread is reopened and a locked one still takes the messages), the board saying the session ended; no DDP frame ever holds a webhook's token nor a sealed value, the owner's included, and whether the server stores the tokens sealed; "Link my Discord account", its token dropped and not revoked, the hint about Discord's Authorized Apps; the player mentioned on their turn's line; "Sign in with Discord" for the linked account in one click (`prompt=none`, no page of Discord's), the nonce and the ticket gone from the browser; its ticket's address, opened in another browser, signs nobody in; a polite refusal for a Discord account linked to none (`prompt=none`, then Discord's page), no account created; everything undone | Built with phase B |
| `discord-interactions` | Against the local fake of Discord, with a Discord application and the fake's public key in the server's settings (else skipped): interactions signed as Discord signs them, a wrong or old signature refused; a Discord account linked to nobody told how to link it; the test account links its Discord account, chooses its character by autocompletion (`/character`), rolls (`/roll`: the character's card, its reroll buttons, the roll in its log), rerolls with advantage, `/check` by autocompletion (secret), `/hp` seen alone then changed and told; a roll in the channel of the character's pasted webhook posted there once, by the reply, and a check made on the sheet posted there without a reroll button; the bot's steps (with `botToken`): `/connect` refused to a member who may not manage webhooks, then connecting the character to a text channel through a webhook the bot creates, a check made on the sheet posted there with its reroll buttons (refused to an unlinked account, rolled again with advantage for its player, in a new message and in the log), "New session" in its form creating the thread and a roll posted into it, `/connect` in a forum's post connecting the forum with its session as a post; the commands registered on the fake with a client credentials token; the Discord page's installation link; everything put back | Built with phase C |
| `discord-action` | Against the local fake of Discord, with a Discord application and the fake's public key in the server's settings (else skipped), and the SRD 5.1 bestiary: makes a board that `e2e-tester-other` joins with its character, adds a goblin given distinctive hit points, armor class and Dexterity save and a hidden effect, gives the character an attack, a spell with a saving throw and spell slots of levels 1 and 2, and starts a fight; the player links their Discord account; `/action` by autocompletion with the attack: the target menu opens by itself and offers the goblin, no advantage is asked, and the result is posted in the channel ("Hit!" and the damage dealt); with the `advantage` option, "(Advantage)"; the spell: the target, then the slot (level 2), "<goblin> · Failed save" posted without the goblin's roll, the slot spent; nothing that left for Discord (answers, menus, results, posts) nor any DDP frame the player's browser received holds the goblin's numbers; "Players target the monsters" off: `/action` refuses the goblin, for the player alone, in French, and the spell's slot menu cancelled logs nothing; everything put back (the Discord account unlinked, which forgets `/action`'s sessions and last targets) | Built with `/action` |
| `party-monsters` | Follows the SRD 5.1 bestiary, makes a board that `e2e-tester-other` joins, adds two goblins through the bestiary picker; the game master's cards show their hit points, challenge rating and type line, the card and the sheet their bestiary's licence linked to the About page; a goblin falls prone and the fight starts; the player sees the goblins' names and the condition, and neither their hit points nor their initiative roll; the end of the encounter deletes them; puts the board and the subscription back; needs the bestiary imported | Built with the monsters (phase 2) |
| `turn-events` | Makes a board that `e2e-tester-other` joins with its character and adds a goblin of the SRD 5.1 bestiary; gives the goblin a trigger at the start of its turn and legendary actions spent that come back then, the character a trigger at the end of its turn; the trigger's viewer reads "Start of turn", its form offers the start and the end of a turn, the attribute's viewer "Reset at the start of each turn"; the fight starts with the character, Next on the board ends its turn and starts the goblin's, each logged once on its creature ("End of turn", "Start of turn", with the triggers' lines) and the legendary actions back without a line (a turn's resets are silent: alone, they log nothing); Previous then Next logs nothing again; the game master reads the goblin's entry on its sheet, the player their character's and nothing of the goblin's; on the goblin's turn, the last of the round, the game master deletes it from its card's menu: round 2 starts with the character's turn, logged once with its trigger at the start of its turn; puts everything back; needs the bestiary imported | Built with the turn events (phase 3.1); deleting the creature whose turn it is moved the turn without starting the next one's (phase 3.5 found it) |
| `party-targeting` | Makes a board that `e2e-tester-other` joins with its character (given an armor class and hit points for the check), adds a goblin of the SRD 5.1 bestiary and starts a fight; on the goblin's sheet its Scimitar opens the target picker by itself, offering "No target" (preselected the first time), the goblin and the character; the game master picks the character and rolls, and the character's own log gets "Goblin → you" with the attack's total, the damage dealt and its hit points, nothing of the goblin's stat block ("+4", "1d6"); "Target" on the goblin's card makes the picker preselect it, and the cast dialog too, whose target menu then casts a cantrip at the character; an event's button never asks for a target; out of the fight the Scimitar does not ask, "Target…" opens the picker with no target, and the character picked is hit, the action's dialog reading its armor class from the board; the player reads the entry in their character's log; puts everything back; needs the bestiary imported | Built with the target picker (phase 2.1) |
| `party-heal` | Makes a board with the test account's character, which `e2e-tester-other` joins with its character, and a goblin of the SRD 5.1 bestiary; the player's healing action ("Target…") offers the game master's character, and the goblin (phase 2.3); picked, the character's hit points go up and its log says "<the player's character> → you" with the healing's roll and the hit points back, which the game master reads on its sheet; on the board, the player's "Target" is on that character's card and the goblin's; the server refuses a rest and damage typed in on it and on the goblin; removed from the party with an attack's dialog open, the player sees the refusal as they roll, and nothing is applied; puts everything back; needs the bestiary imported | Built with player → player targeting (phase 2.2) |
| `party-monster-attack` | Makes a board that `e2e-tester-other` joins with its character, and adds a goblin of the SRD 5.1 bestiary given distinctive hit points, armor class and Dexterity save, and a hidden effect; the player's attack ("Target…") offers the goblin, the action's dialog says "result at resolution", and the character's log says "Hit!" and the damage dealt, nothing of the goblin's; a saving throw reads "<goblin> · Failed save" without the goblin's roll; the game master reads everything in the goblin's log; no DDP frame the player's browser received holds the goblin's numbers; "Players target the monsters" turned off on the board takes the goblin out of the player's picker and card, and the server refuses it; puts everything back; needs the bestiary imported | Built with player → monster targeting (phase 2.3) |
| `party-undo` | Makes a board that `e2e-tester-other` joins with its character, and adds a goblin of the SRD 5.1 bestiary (an encounter) with a club of the step's, without a roll; the goblin hits the character, whose log gets the entry with "Undo" for its player; the player undoes it from the log: the hit points come back, the entry says "Effect undone by" them, an entry of its own says what came back, the button is gone; a second undo is refused; hit again, the game master ends the encounter: the button goes and the server refuses; puts everything back; needs the bestiary imported | Built with undoing a received effect (phase 2.4) |
| `party-legendary` | Makes a board that `e2e-tester-other` joins with its character (given an armor class, hit points and a spell whose Wisdom save no dragon makes), adds an adult red dragon of the SRD 5.1 bestiary and starts a fight, the character first; the game master's initiative tracker shows the dragon's legendary actions, "3/3", the player's nothing of them; on the character's turn the menu lists the options and their cost, and says nothing of the dragon's turn; its Tail Attack opens the target picker, the character picked and the attack rolled, the character's log gets the tail and the tracker reads "2/3"; the player's spell at the dragon reads "<dragon> · Failed → success (legendary resistance)" without its roll, one resistance spent; the breath spent by hand, Next starts the dragon's turn, whose log rolls the breath's recharge (back on a 5 or 6 only) and whose legendary actions are back, "3/3"; on its own turn the menu says so; puts everything back; needs the bestiary imported (regenerated for phases 3.2 to 3.4) | Built with legendary actions, Recharge and legendary resistance (phases 3.2 and 3.3) |
| `anchored-durations` | Makes a board that `e2e-tester-other` joins with its character, adds a goblin of the SRD 5.1 bestiary with a trigger at the end of its turn, and starts a fight, the character first; on the goblin's turn the board's condition menu offers "Until the start/end of its next turn" and "Until the start/end of the next turn of…" the board's creatures, and sets the character's condition until the end of the goblin's next turn, which the chip's title says; the condition's viewer says it is counted at the end of the turns of the creature that applied it, and names the goblin, its form shows both choices; the goblin's turn it was set in ends, the character's starts and ends, and the condition stays; the goblin's next turn ends it, in the character's log under "End of <goblin>'s turn", which the player reads without the goblin's trigger line; puts everything back; needs the bestiary imported | Built with anchored durations (phase 3.5); found that the last creature of a round never ended its turn |
| `licenses` | Signed out, the About page's Licences and credits: each edition's SRD 5.1 attribution statement, word for word against the bestiary library's description and, when `tools/monsters/work` holds them, the SRD's page 1; the Section 5 note, the changes, the icons' credit; the English edition first; then a bestiary's library page shows "SRD 5.1 · CC BY 4.0" linked there. Read-only | Built with the licences (phase 3) |
| `account` | The Account page's preferences (units, animations, theme, language, ability scores), each set and set back as the database records them; the username dialog refuses a taken name and accepts a free one (never applied); the share dialog finds `e2e-tester-other` and not an unknown name (nothing shared); a community library followed and unfollowed; then `<E2E_USERNAME>-deleted`, made for it, deletes its account through its dialog: gone, signed out, on the home page | Deleting an account closed the connection before the server answered: the call, sent again signed out, failed with "No user" and the dialog stayed open |
| `library-node-actions` | On a library of the test account's own with a buff remover, put in the database and removed at the end: the sharing dialog saves "Who can copy"; "Create reference" in the node's menu makes a reference at the node's place; the buff remover's form saves "Remove parent buff" and "Remove all buffs" | The copy option called the method object (it threw), the reference read `parent` (a field before schema v3) and the method refused it, the toggles compared `model-value` (`model - value`): none ever saved |

### Discord, against a local fake

`discord-webhook` starts a fake of Discord's webhook API on `127.0.0.1:3990`
(`lib/fakeDiscord.js`, `E2E_DISCORD_PORT` to change it) and runs its posting
steps only when the server says it posts there: a development server started
with

```sh
DISCORD_WEBHOOK_TEST_API=http://127.0.0.1:3990/api/v10 meteor run --settings settings.json
```

The server honours that variable only in development and tests, and only for
an address on this machine. `discord-oauth` also needs a Discord application in
the settings: `"discord": { "clientId": "1600000000000000001", "clientSecret":
"fake" }` (any values: the fake takes them), and `"tokenKey"` (`openssl rand
-base64 32`) to check that the tokens are stored sealed, and for
`discord-interactions` and `discord-action` `"publicKey": "1276c36eb5cdb0f522d1438c84cdc19a8d4893c11defdac842ea78d053296e31"`,
the public key of the fake's test key pair (`INTERACTIONS_PUBLIC_KEY` in
`lib/fakeDiscord.js`), and `"botToken": "fake-bot-token"` for its bot's steps, in a copy of `settings.json` the
server starts with. Without it (or against a production bundle) the
check skips those steps and never sets a webhook Discord could take: nothing
ever reaches Discord.

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
| `E2E_EXTRA_ROUTES` | unset | More pages for `routes` and `accessibility` to load signed in, comma-separated: `/a,/b` |
| `E2E_DISCORD_PORT` | `3990` | The port of the fake Discord the Discord checks start |

## Safety

- The checks refuse to run against anything but a local app and database, unless
  `E2E_ALLOW_REMOTE=1`.
- They sign in only as an account whose name starts with `e2e-`, with its
  password; they never write login tokens into the database.
- They read the database (to find the test character and sample library nodes)
  and change data through the app, as a user would, but for what the app has
  no way to do: `discord-webhook` without the fake sets its made-up webhook
  straight in the database (the app takes only Discord's URLs) and takes it
  out the same way, `discord-interactions` clears its rerolls, and `slot-fill`
  inserts a library of the test account's with a note (only admins create
  libraries in the app), then removes them. Through the app: `setup` creates the
  account and a character; `flows` creates a property and removes it again,
  and gives the test character a condition and takes it away;
  `actions` takes a short rest with the test character; `contrast` sets the test
  account's theme preference to "Match device theme"; `print-cards` gives the
  test character a library spell and item, and removes them again;
  `discord-webhook` gives the test character a made-up webhook, shares it with
  `e2e-tester-other` and makes it public, then takes all three back; against
  the fake Discord, it also rolls, opens sessions and makes a party board
  that `e2e-tester-other` joins, then deletes the board;
  `party-monsters` follows the SRD 5.1 bestiary, makes a board with two goblins
  that `e2e-tester-other` joins, then deletes the board and the goblins and
  follows the bestiary only if the test account already did;
  `discord-oauth` and `discord-interactions`, against the fake, connect the
  test character and a board to Discord, link the test account's Discord
  account, roll and change hit points, then undo all of it; `discord-action`,
  against the fake, makes a board with a goblin that `e2e-tester-other` joins,
  gives its character an attack, a spell and spell slots, links its Discord
  account and plays them from Discord, then undoes all of it; `licenses` only
  reads; `account` changes the test account's preferences and a library it
  follows and sets them back, and creates `<E2E_USERNAME>-deleted` and deletes
  it through the Account page; `library-node-actions` puts a library of the
  test account's in the database, with a buff remover, and removes them with
  the reference it makes.
