# DiceCloud — UI and functional fixes after the Vue 3 / Vuetify 3 migration

Reported 2026-09-24 from manual testing of the migrated app (dark theme). Companion
to `implementation_plan.md`, which covers the migration itself.

Method for every item: find the component, compare it with the Vue 2 / Vuetify 2
baseline (`git show fe58180a:app/...`), fix it with the Vuetify 3 equivalent, and
verify with a before/after screenshot of the same view in the browser, plus the
console and the server log.

Status: ⬜ to do · 🟡 in progress · ✅ done (verified) · ⚠️ needs your decision

## Functional issues

| # | Issue | Status | Cause | Fix |
|---|-------|--------|-------|-----|
| F1 | Signing out throws `Cannot read properties of null (reading 'services')` (`pages/Account.vue`) | ✅ | The template read `user.services.google` unguarded. In Vue 2, `signOut` called `Meteor.logout()` and `router.push('/')` synchronously, so the page left before `user` became `null`; now `await Meteor.logoutAsync()` lets the page re-render with `user === null` first | `v-if="user && !user.services?.google"`. Verified: signing out from `/account` lands on `/`, `Meteor.userId()` is `null`, no errors |
| F2 | A library node's view panel is empty (e.g. the "README" note); its description only shows in edit mode | ✅ | **Wider than reported.** `PropertyField` rendered only if it had a value, a calculation, or `$slots.default && $slots.default.length` — a Vue 2 idiom: `$slots.default` was an array of vnodes. In Vue 3 it is a function, whose `.length` is 0, so every `PropertyField` with only slot content rendered nothing: every description and summary in every property viewer (characters too, not only libraries), plus "Library Behavior", "Status" and the like. The data was there throughout (traced: client document, viewer props and child render tree all correct; the field's own root `v-if` was false) | `v-if="… \|\| $slots.default"` — a provided default slot always had at least one vnode in Vue 2, so "provided" is the equivalent. No other `$slots.x.length` in the client. Verified: the README note shows its markdown description in view mode |

## CSS / layout issues

| # | Issue | Status | Cause | Fix |
|---|-------|--------|-------|-----|
| C1 | Sidebar: the "Github" link's external-link icon wraps onto its own line | ✅ | The icon sat in `v-list-item`'s default slot after the title. Vuetify 2's list item was one flex row; Vuetify 3 stacks default-slot content in a column | Icon moved to the `#append` slot (`layouts/AppSidebar.vue`). Verified: same row, icon at the right end |
| C2 | Home page feature cards: label misplaced, background image not full size | ✅ | Vuetify 3's `v-img` defaults to `contain`; Vuetify 2's default was cover. The portrait screenshots shrank inside the 360 px frame, which left the title floating at the card's bottom edge. **Same cause in 13 more images** — every other `v-img` in the client was cover in Vue 2 (audited against `fe58180a`): character portraits (`CreatureSummary`, `CharacterSheetInitiative`), image cards and the image input, the About and auth-page images, and five tabletop views | `cover` on all 14 `v-img`s. Verified on the home page: all eight cards filled (`object-fit: cover`), each label on the image's bottom edge over the gradient |
| C3 | Account page: the "Theme" label of the theme selector is cropped, and invisible in dark mode | ✅ | Two causes. **Invisible:** `OutlinedInput` styled itself from `inject('theme')`, the `{ isDark }` object Vuetify 2's `v-app` provided. Vuetify 3 provides no such object, so the inject always fell back to `{ isDark: false }` — dark grey text on a dark background. **16 components** had this, all stuck on light-theme styling in dark mode (`PropertyField`, `OutlinedInput`, `SvgIcon`, `CardHighlight`, the action/buff/note/point-buy/slot cards, image fields…). **Cropped:** the legend straddles the fieldset's top border, and Vuetify 3's `.v-list-item__content` has `overflow: hidden` (Vuetify 2's did not) | New `ui/utility/useThemeState.js` returns the same `{ isDark }` from Vuetify 3's `useTheme()` (nearest theme, as before); all 16 injects replaced, templates unchanged. The Account page's theme row lets its content overflow (scoped style) — the only fieldset-style input inside a list item. Verified: legend fully visible, light text on dark |
| C4 | Sign-in form: fields collapse to a few characters wide | ✅ | The fields sit in a centred column (`flex-column align-center`), so nothing stretches them. Vuetify 2's `<input>` kept its natural HTML width (~20 characters); Vuetify 3's is `width: 100%; min-width: 0`, so the field shrank to its minimum. Same layout on Register and Reset Password | `w-100` capped at `max-width: 320px` on all 9 auth-page fields. Verified on Sign In and Register: full-width fields, labels complete |
| C5 | Character sheet: the "+" button at the top right has no background | ✅ | The speed dial sits inside the sheet's toolbar, and **Vuetify 3's `VToolbar` provides `variant: 'text'` as the default for every `VBtn` inside it** (`provideDefaults`, `VToolbar.js`). Vuetify 2 had no such default, and its `fab` buttons were filled. Same cause for the speed dial's items (`LabeledFab`), the library tree's "+" (`InsertLibraryNodeButton` — the "+" beside "Organize" in the report's screenshot) and the printed sheet's print button | `variant="elevated"` on all four (overridable on `LabeledFab`). Verified: round filled "+", and filled items when the dial opens |
| C6 | Character sheet, Build tab: the "+" button in the Slots card is misplaced (overlaps "Ruleset") | ✅ | The markup matches Vue 2 (the "+" always followed the slot name). What changed is the button: **Vuetify 2's `icon` buttons were always flat; Vuetify 3's `VBtn` defaults to `variant: 'elevated'` even with `icon`**, so the "+" became a 48 px dark disc with a shadow that covered the name. **86 icon buttons in 60 files** rendered that way — the dark discs on tree chevrons, trash, hit-dice, info and edit buttons across the app. Separately, the Vue 2 **fabs** used `fixed`/`absolute`, which are not Vuetify 3 button props: the Character List, Library and Tabletops "+" rendered inline at the top of the page instead of pinned to the corner | `variant="text"` on the 80 icon buttons that were not fabs in Vue 2. The 6 that were (identified by their `fixed`/`absolute`/`elevation`) keep the filled default; `fixed` → `position="fixed"` + `ma-4` (Vuetify 2's 16 px corner offset), `absolute` → `position="absolute"`. Verified: flat red "+" after "Ruleset"; Character List, Library and Tabletops buttons fixed 16 px off the bottom-right corner, filled. (`Friends.vue` is not routed — `/friends` shows a "not available" notice) |
| C7 | Markdown from libraries renders without paragraph spacing or list padding | ✅ | `styles/markdown.css` is unchanged from Vue 2 apart from theme class names; the spacing came from Vuetify 2's global element styles (paragraph bottom margin, list indent). **Vuetify 3's reset is `* { padding: 0; margin: 0 }`** (`vuetify/lib/styles/main.css`), so paragraphs ran together and list bullets hung outside the box | Restored for `.markdown` only: 16 px bottom margin on paragraphs, lists, blockquotes and code blocks; 24 px list indent (nested lists continue their item); blockquote rule; inline and block code padding. Applies to every `MarkdownText` (property descriptions, library and collection descriptions, docs). Verified on the Vexus collection description: paragraph gaps, indented bulleted list |
| C8 | Documentation pages: layout broken (cards clipped, table of contents floating, large gaps) | ✅ | Three causes. **Cards cut mid-line:** `DocCard` clips its preview with a fading mask on `.v-card__text`, Vuetify 2's class; Vuetify 3 renamed it `.v-card-text`, so the rule matched nothing. **Lone ">" breadcrumb:** Vuetify 3's breadcrumb items take `title` where Vuetify 2 took `text`, so every item rendered empty. **Text spacing:** C7. The floating table of contents, and the gap it leaves beside a short intro, are unchanged from Vue 2 (same `DocViewer` template and styles) — reworked in round 2 (D1). **Audit of stale Vuetify 2 class names in all CSS and templates** (checked against Vuetify 3's own CSS) found five more: `.v-toolbar__title` (toolbar-card title size), `.v-card__title` (global word-break override), `.v-expansion-panel-header` / `-content__wrap` (library browser padding), `.v-application--wrap` (**printed character sheet's print layout**), and the `text--secondary` / `text--disabled` utilities in 8 templates | Renamed to `.v-card-text`, `.v-toolbar-title`, `.v-card-title`, `.v-expansion-panel-title` / `-text__wrapper`, `.v-application__wrap`, `text-medium-emphasis`, `text-disabled`; breadcrumb items use `title`. `styles/denseLists.css` deleted: it zeroed margins on dense-list avatar/action elements Vuetify 3 does not render. Verified: "Docs > Properties" (and "Docs > Properties > Actions") breadcrumbs, card previews fade out at the bottom |

## Round 2 — your decisions and new reports (2026-09-24)

| # | Item | Status | Cause | Fix |
|---|------|--------|-------|-----|
| F3 | `/docs/api/...` pages load no content (reference: dicecloud.com/docs/api/login) | ✅ | Not specific to the API docs: **any** doc reached by navigating inside the app (a card, a sibling link) showed its title but an empty body; loading the URL directly worked. `MarkdownText`'s template starts with an `<!-- eslint-disable -->` comment, and **Vue 3 keeps template comments in development builds**, so the component rendered as a fragment (comment + div; confirmed `Symbol(v-fgt)`). The doc body sits in `<v-fade-transition mode="out-in">`, which cannot animate a fragment: the old body left and the new one was never inserted. Production builds strip comments, so this was dev-only; 3 other components (`LabeledFab`, `TreeNodeList`, `CharacterSheetFab`) were fragments in dev for the same reason (attributes stop falling through) | `compilerOptions: { comments: false }` for `vue-loader` in `rspack.config.js`: development now compiles templates like production and Vue 2 did. Verified: `/docs` → API → Login to api → Creature, signed in and out, each shows its body |
| F4 | A character created with a library collection selected ignores it: no ruleset in the Build tab, no stats (expected: as on dicecloud.com) | ✅ | The character stored its libraries correctly; the ruleset was never filled. `insertDefaultRuleset` fills the Ruleset slot only when **exactly one** library node matches it. The upstream Vexus collection has 21 members, but my `createCollection.js` had grouped all 23 manifest libraries — including the two the README says were pulled only to close the reference graph. One of them (*Tameran's Library of Newer and Slightly Different Things*) holds a second, 2024 "Character Base", so there were two candidates and none was filled. (Separately, the insert was fired without `await` — errors would have been lost and the creation method returned before the ruleset landed) | Manifests mark the two extras `referenceOnly` (English and French); `createCollection.js` leaves them out of the collection and lists them on their own again. Both collections re-run: 21 members each. `insertDefaultRuleset` now awaits `insertPropertyFromLibraryNode.callAsync`. Verified with an account subscribed to the collection, as the creation dialog requires: new character's Ruleset filled with "Tameran's Library of Everything: Character Base" (197 properties) and "Tutorial: Introduction to LoV" inside it, all in place when the method returns; the Stats tab matches the dicecloud.com screenshot |
| D1 | Docs table of contents: improve the layout | ✅ | Unchanged from Vue 2: the sibling list floated right inside the intro column, so a short intro left a gap before the child cards, and the list scrolled away on long pages | `DocViewer.vue`: two columns on wide screens (≥ 960 px): content — title, text, then the child cards directly below — and the table of contents in its own column, sticky 16 px under the app bar. Below 960 px the list stacks above the content, as the float effectively did. With no table of contents (docs home) the content spans the breadcrumbs' width; `DocsPage.vue`'s breadcrumbs widened to match. Float CSS removed. Verified with screenshots at 1600, 1100 and 400 px on `/docs`, `/docs/property`, `/docs/api/login`; after a 2000 px scroll the list sits at 104 px (88 px app bar + 16) at 1600 px and scrolls away at 800 px; F3's navigation probe re-run through the new list |
| D2 | Links in dark mode: improve the colour | ✅ | Vuetify 2's theme coloured every link with its `anchor` colour (primary by default); Vuetify 3 has no such rule, so links fell back to the browser's blue/purple: 1.7:1 and 1.5:1 contrast on dark cards | `styles/body.css`: `.v-application a:not([class])` takes the theme's primary colour, as in Vuetify 2 and on dicecloud.com. Vuetify components rendered as `<a>` carry classes and keep their own colours. Contrast: dark theme 5.0:1 on the page background, 3.6:1 on cards once L4 restored their `#303030` (below WCAG AA's 4.5:1, as on dicecloud.com; links stay underlined); light theme 6.6:1. Verified in the docs and collection descriptions |
| D3 | Register page: "REGISTER IN WITH GOOGLE" copy | ✅ | Not a functional issue: a copy-paste slip from the Sign In page's "Sign in with Google", present in Vue 2 too. The button calls the same Google login either way | Now "Register with Google" (`pages/Register.vue`) |
| D4 | Remove the dead `config.freeze = true` | ✅ | vue-meteor-tracker 2 option; version 3's `config` only holds `subscribe`, so the line did nothing | Removed with its import from `vueSetup.js`. Verified: no console messages on the crawl |

## Round 3 — library page and tabletops (2026-09-24)

Reference: a library on dicecloud.com (not owned, so no "+").

| # | Item | Status | Cause | Fix |
|---|------|--------|-------|-----|
| L1 | Library page: an extra column on the left | ✅ | The hidden "second library tree". `LibraryAndNode` always passes a `#left-tree` slot and puts the `v-if` on its content; `TreeDetailLayout` draws the column when `$slots['left-tree']` exists. **Vue 2 treated a slot whose content rendered nothing as absent; in Vue 3 a slot written in the template always exists.** Scanning every slot the client tests for found three more with conditional-only content: `#actions` in `LibraryNodeDialog`, `CreaturePropertyDialog` and `CreatureRootDialog` (`v-if="!embedded"`), so the embedded detail panes (library page, character Tree tab) drew an empty actions bar | The condition moved onto the slot (`<template v-if="…" #slot>`), which Vue 3 omits when false — all four |
| L2 | Library page: tree column too wide | ✅ | Found with L1. `TreeDetailLayout`'s tree columns are meant to be 320 px (400 px on xl) beside the detail pane. Vue 2 used `.layout`, whose `flex: 1 1 auto` gave way to the inline `flex-grow: 0; width: 320px`; the migration used `flex-1-1`, which in Vuetify 3 is `flex: 1 1 auto !important`, so every column grew (528 px each at 1700 px). Same layout on the character sheet's Tree tab | A scoped `.tree-column { flex: 1 1 auto; min-width: 0 }` that the inline width overrides, as before |
| L3 | Library page: the "+" button looks wrong | ✅ | Vue 2: `fab small`, a 40 px disc hanging half over the toolbar's bottom edge (`bottom: -24px`). Converted to a plain small button with `rounded-circle`: Vuetify 3's small button is at least 50 × 28 px, so it became an ellipse, and **Vuetify 3's `.v-toolbar__content` clips overflow**, which cut its lower half. Its insert callback also called `this.$emit` — `this` is undefined in `<script setup>`, so it threw after inserting, and the new node was not selected (from the code; not run before the fix) | `icon` (Vuetify 3's round button: 40 × 40 at `size="small"`); the tree toolbar lets content overflow (scoped); `emit` from `defineEmits`. The Organize switch sat 15 px below the toolbar's centre line (Vue 2 margins for a Vuetify 2 switch): `density="compact"`, margins removed, also on the Tree tab. Verified: 40 × 40, round, 12 px overhang as in Vue 2; switch label, search icon and toolbar share one centre line; inserting a folder with "+" shows it in the tree and selects it, console clean |
| L4 | Library page colours differ from dicecloud.com (seen in the reference screenshot) | ✅ | Sampled pixels: app bar, page and toolbars matched; **sidebar `#212121` (reference `#363636`) and cards `#212121` (reference `#303030`)**. The app gives dark cards `#303030` in `cardColors.css` via `.theme--dark.v-sheet` (renamed `.v-theme--dark.v-sheet`); Vuetify 2 cards, lists and toolbars carried `v-sheet`, Vuetify 3 cards do not, so they fell back to Vuetify 3's surface `#212121`. The drawer was Vuetify 2's dark drawer colour, `#363636`. Checking the rest: **uncoloured toolbars** are Vuetify 3's `surface-light` (`#424242`, lighter than their card) where Vuetify 2 had `#272727` (e.g. the character Tree tab) — values read from Vuetify 2.6.15's stylesheet, the baseline's version | The theme carries them (`themes.js`): dark `surface: '#303030'`; `drawer` (`#FFFFFF` / `#363636`) on the navigation drawer; `toolbar` (`#FFFFFF` / `#272727`) as every `VToolbar`'s default colour (`defaults` in `vuetify.js`; all app bars set their own colour). The now-redundant sheet rule removed from `cardColors.css`. Verified by pixel sampling: library page sidebar `#363636`, card `#303030`, toolbars `#212121` — all as the reference; character sheet cards `#303030`; Tree tab toolbar `#272727` in both themes |
| T1 | Selecting a tabletop (not launching) shows "[object Promise]" | ✅ | **17 lazily loaded dialogs** were registered as bare `() => import(…)` in `DialogComponentIndex.js`. Vue 2 accepted a factory as an async component; **Vue 3 needs `defineAsyncComponent`** and otherwise calls the factory as a functional component, rendering the returned Promise as text. Every one was broken: tabletop, archive, character import, share, username, library create/edit/collection dialogs, move node, cast-with-slot, image input, dependency graph, select creatures, creature from library, delete account, and the library node dialog on small screens. (No other bare `import()` component in the client; route components are fine — vue-router 4 accepts them) | All 17 wrapped in `defineAsyncComponent`. Verified: selecting the tabletop shows its name, owner, game masters, Close and Launch; each of the 17 pushed onto the dialog stack resolves to its component |
| T2 | Username dialog (found by T1's check) | ✅ | Converting it dropped its `meteor: { username }` property: the field never showed the current username (`Property "username" was accessed during render but is not defined`). Its `catch (error) { error.value = … }` shadowed the `error` ref, so a failed update never showed its message; the same slip in `TransferOwnershipDialog` (found by scanning every `catch`). The 18 eagerly loaded dialogs, checked the same way, have no such warning | `username` from `autorun(() => Meteor.user()?.username)`; catch parameters renamed. Verified: Account → change username shows `m3v3-5gpwe3`, console clean |

## Round 4 — values in edit forms (2026-09-24)

| # | Item | Status | Cause | Fix |
|---|------|--------|-------|-----|
| V1 | Library entries: empty tags show "false" | ✅ | **Wider than tags, and not only libraries: every edit form** (character properties too). The stored data was right (`tags: []`; no `false` or `"false"` in any field of libraryNodes, creatureProperties, libraries or creatures). The shared input props (`useSmartInput.js`) declare `value` and `modelValue` as `[String, …, Boolean]`. **Vue casts a Boolean-typed prop the parent leaves out to `false`**; callers pass `value` (the Vue 2 way), so `modelValue` was always `false`, and `modelValue ?? value` picked it (`??` only skips null/undefined). Every `smart-combobox`, `smart-select`, `smart-toggle` and `smart-checkbox` (65 uses) showed `false` instead of the stored value: tags as a "false" chip, selects as "false", toggles with nothing selected. Saving could store it: adding a tag to a combobox holding `false` sends `[false, "tag"]`, which the schema turns into `"false"` | `default: undefined` on both props (Vue's documented way to opt out of Boolean casting; the five inputs that redeclare these props already did). No other Boolean-cast `value`/`modelValue` in the client. Verified: README tags empty; attribute Type "utility", action type "free", target "singleTarget", toggle "calculated" all shown |
| V2 | Selects show "[object Object]" (hidden until V1 was fixed) | ✅ | Vuetify 2 select items were `{ text, value }`; **Vuetify 3 reads the label from `title`**, and an item without one is printed whole. 99 item objects in 17 files (property forms, sharing, tabletop and library-collection dialogs, reset selector, tree search filter, the attribute/skill lists built by `createListOfProperties`), plus `TriggerForm`'s generator behind its three selects | `text:` → `title:` in those items (the dead `#item` slot in `EffectForm`, never forwarded by `SmartSelect` in Vue 2 either, reads `title` too) |
| V3 | Adjustment properties crash when shown (found by the all-types check) | ✅ | `AdjustmentViewer`: `let value = value.value;` inside a computed — the conversion turned `this.value` into `value.value` but kept the local `let value`, which shadows the outer computed and reads itself (`Cannot access 'value' before initialization`). Every adjustment viewer, in libraries and on character sheets. No other self-referencing declaration in the client (scanned) | Local renamed `amount` |

Verification: one library node of each of the 28 property types opened in view and
edit mode (twice): every select/combobox item carries the key Vuetify displays, no
field shows "false" or "[object Object]", console clean. A select menu opened on
the test character's attribute lists "Ability score / Stat / … / Utility" and shows
"Stat". ESLint 0 errors (7 known warnings); 13-step flow clean; 17 signed-in and 7
anonymous routes with zero console messages; all lazy dialogs resolve; server log
clean; `meteor test` 105 / 0 / 7. `meteor build` not re-run: no bundler change.

## Round 5 — sign-in page (2026-09-24)

| # | Item | Status | Fix |
|---|------|--------|-----|
| S1 | Remove the "DiceCloud Version 2 requires a new account… Version 1 is still available at v1.dicecloud.com" notice | ✅ | Removed from `SignIn.vue` (other v1 mentions: `implementation_plan.md` TODO 10) |
| S2 | Google buttons shown although Google is not configured ("Service not configured") | ✅ | Shown only once a `google` login service configuration exists (`useLoginServiceConfigured`): Sign In, Register (with their divider) and Account's "Link Google Account". Verified both states with a temporary probe configuration; setup documented in the README |

## Round 6 — mobile theme selector, accessible colours (2026-09-24)

Colour decisions measured, not eyeballed: WCAG AA is 4.5:1 for text, 3:1 for icons.

| # | Item | Status | Cause | Fix |
|---|------|--------|-------|-----|
| M1 | Account page on a phone: the theme selector shows only "Dark" | ✅ | The options wrap onto more rows (`flex-wrap: wrap`), but **Vuetify 3's button group has a fixed 48 px height and hides overflow**: "Match device theme" and "Light" sat at 42 and 84 px, cut off. Vuetify 2's toggle grew with its content. Same for every `smart-toggle` in property forms on narrow screens | `SmartToggle`: the group's height is `auto`. Verified at 390 px: 126 px tall, all three options visible, "Dark" selectable |
| A1 | Links in dark mode: "choose a better colour (accessibility first)" | ✅ | The primary red (#f44336) is 3.6:1 on the #303030 cards | New theme colour **`highlight`**: dark `#EF9A9A` (Material red 200, Material's tone for colour on dark surfaces), light `#B71C1C`. Contrast on the dark surfaces: 8.5 (page), 6.9 (toolbars), 6.1 (cards), 5.6:1 (drawer); the redder `#FF8A80` also passes but is lower on each (5.3:1 on the drawer). Links keep their underline. Measured in the app: 6.13:1 dark, 6.57:1 light (83 links on the Properties doc) |
| A2 | Light mode: bar colour (accessibility first) | ✅ | Light mode had two bar colours: `#212121` (app, library and docs bars, `theme="dark"`) and `#424242` (character sheet bar, the light theme's secondary). Measured on the bars: white text 16.1:1 on `#212121` against 10.1:1 on `#424242`; the red active tab 4.4:1 against **2.7:1** (the tab also missed 4.5:1 in dark mode) | `#212121` for all of them: the character sheet bar now defaults to the dark theme's secondary in both themes (a creature's own colour still wins). The active tab uses `highlight` (7.5:1), or the plain text colour on a creature colour. Measured: every bar text ≥ 16.1:1, active tab 7.5:1, the "+" icon 3.7:1 (icon, needs 3:1) |
| A3 | Selected toggle option (found with M1) | ✅ | White text on the accent red, lightened further by Vuetify's "activated" overlay: **2.5:1** in dark mode (4.4:1 in light once on `highlight`) | Selected options use `highlight` (Vuetify gives the dark `#EF9A9A` near-black text), and the resting "activated" overlay is dropped (hover and focus feedback kept): 9.76:1 dark, 6.57:1 light, measured on the rendered pixels |

Verification: the new browser suite (`tests/e2e`, see `implementation_plan.md` TODO 6)
runs these as its `contrast` check in both themes; 8 of 8 checks pass.

## Round 7 — design system (2026-09-24)

Decision: "make sure that the project follows a relevant design system". Chosen:
Material Design, the system Vuetify implements, with **Material 3's colour roles**,
documented in `DESIGN_SYSTEM.md` at the repository root.

| # | Item | Status | Cause | Fix |
|---|------|--------|-------|-----|
| DS1 | Colour palette | ✅ | Material 2 swatches picked by hand: the dark theme used the light theme's hues (primary #f44336: 3.6:1 as text on cards; white on it 3.7:1), and no warning or success swatch was readable as text on white. The round-6 `highlight` colour patched three places | `themes.js`: every role (primary, accent, error, warning, info, success) generated from DiceCloud's earlier colours as seeds with Google's material-color-utilities, at Material 3's tones (light 40 / on 100, dark 80 / on 20; containers 90/10 and 30/90), with explicit `on-` colours; `primary-container` and `error-container` added. Every role ≥ 6.0:1 as text on every light surface and ≥ 7.1:1 on every dark one; ≥ 6.4 / 7.7:1 under its on- colour. `highlight` removed: links, the active tab and selected toggles use `primary` again. Visible change: in dark mode, filled buttons (Sign in, the "+") are light red with dark red text |
| DS2 | Colours hard-coded in components | ✅ | `SpellListTile` forced the light theme's red on selected spells in both themes (**2.1:1** on dark); `ActionCard` subtitles `#9e9e9e` (**2.7:1** on white); the dependency graph: variable names 3.6:1, white on loop nodes 2.9:1, edges 2.4:1; brand reds in `VerticalHex` and the image picker | Theme roles instead: `SpellListTile` and the image picker use `primary`, `ActionCard` Material's medium emphasis, `VerticalHex` `primary`; the graph (dark canvas in both themes) takes the dark theme's roles: variables `primary` 7.8:1, property nodes `primary-container` 7.2:1, loop nodes `error-container` 7.2:1, edges #9E9E9E 6.8:1. `HexagonProgress.vue` deleted: unused since `HexagonProgressStack` went with tabletops. The neutral greys still written as values are listed in `DESIGN_SYSTEM.md` |
| DS3 | Light-theme secondary text (found by the axe-core audit) | ✅ | Vuetify stacks its medium-emphasis opacity (0.60) on text already at 87%: labels and list subtitles were 52% black, **#7A7A7A, 4.29:1** on white | Light theme `medium-emphasis-opacity` 0.68: 59% black, Material's 60% level, 5.6:1 on white, 5.4:1 on the page background |

Verification: new `palette` check (every role against every surface, as Vuetify
applies them, both themes) and `accessibility` check (axe-core's WCAG AA
colour-contrast rule on 10 pages × 2 themes): all pass; before DS3 the audit failed
on the sign-in, register and about pages in light mode.

## Round 8 — Stats tab layout (2026-09-24)

| # | Item | Status | Cause | Fix |
|---|------|--------|-------|-----|
| H1 | Stats tab: the Hit Points bar starts in the middle; it should fill the row after the label, as before | ✅ | Vue 2's `v-flex` (`flex: 1 1 auto`) gave way to the inline `flex-basis: 300px; flex-grow: 100`, so the bar took nearly the whole row. The migration used Vuetify 3's `flex-1-1`, which is `flex: 1 1 auto !important`: label and bar grew equally and split the row in half (the same trap as L2). Scanning every template for `flex-1-1` beside an inline flex value found three more: the property toolbar's edit buttons (meant not to shrink), a container card's title and the tree nodes' title row (both meant not to grow) | `flex-1-1` removed from the four; the intended value written in full inline (`flex: 100 1 300px`, `1 0 auto`, `0 1 auto`). Verified: the bar spans 676 of 830 px beside a 154 px label, as in the reference screenshot; new `flows` step asserts the bar takes ≥ 75% of the row (the e2e character gets a Hit Points health bar in `setup`) |
| H2 | Folder card titles ("Death Save") against the card's left edge (seen in the same screenshots) | ✅ | Vue 2's `v-subheader` always had 16 px of padding; Vuetify 3's `v-list-subheader` is only indented inside a `v-list`. Six are used outside one: the Stats tab's folder cards, the Files page (3) and the property type picker (2) | One rule in `styles/body.css` restores the 16 px (inside lists Vuetify's own `!important` indent still applies). Verified on the Files page (16 px); the `routes` check now fails on any subheader with less |

## Round 9 — checks and chat messages (2026-09-24)

| # | Item | Status | Cause | Fix |
|---|------|--------|-------|-----|
| K1 | Stats tab: clicking a check button throws `Cannot read properties of undefined (reading 'prop')` (`CheckInput.vue`) | ✅ | Two bugs. **Vue 3's `v-model` passes `modelValue` and listens for `update:modelValue`**; Vue 2's passed `value` and listened for `input`. `ActionDialog` uses `v-model` on its input components, but `CheckInput`, `AdvantageInput` and `CastSpellInput` still took `value`: `props.value` was undefined, and every choice they emitted (ability, skill, DC, advantage, spell, slot) was lost. Then `CheckInput` listed abilities and skills for `value.prop.root.id`, but a check task has no `prop` (same in Vue 2, where the lists were lazy; `<script setup>` runs them at once) | The three inputs use `modelValue` / `update:modelValue` (`ChoiceInput` already accepted both; `RollInput` is unused). `CheckInput` lists the checked creature's abilities and skills from the task's `targetIds[0]`. Verified: Athletics check opens with Strength and Athletics, rolls, and logs "Roll 1d20 […] + 0" |
| K2 | Chat messages cut off after a death save or any action | ✅ | Two bugs. **The log drawer**: it is a scrolling flex column; flex items may shrink to their content height but not below it unless they hide overflow, and Vuetify 3's cards hide it (Vuetify 2's did not), so once the log filled up every entry shrank and clipped its text. **The action dialog's result preview**: Vue 2 made the action object reactive in place, so the engine's updates showed; Vue 3 only sees changes made through its proxy, and the engine appends log lines through its own references, so the preview kept only the first line ("Strength (Athletics)" without the roll) | Log entries do not shrink (`LogEntry.vue`, `flex-shrink: 0`); the dialog holds the action in a `shallowRef` refreshed with `triggerRef` whenever the engine pauses for input or finishes. Verified: death-save shaped entries (inline items, multi-line values) show in full, the preview shows the roll |

The e2e `actions` check now runs an Athletics check through its dialog (the preview
must show the roll; Done must close it) and fails if any log entry is cut off;
`setup` adds a Strength ability and an Athletics skill to the test character.

## Progress log

### 2026-09-24
- Plan created from the report.
- All 10 items fixed and verified (F1–F2, C1–C8). Most were one instance of a
  Vuetify 2 → 3 or Vue 2 → 3 change that affected more than the reported spot, so
  each was fixed across the app:

  | Change | Reach |
  |--------|-------|
  | `$slots.default.length` (Vue 2 slots were arrays; Vue 3's are functions) | Every slot-only `PropertyField`: all descriptions/summaries in every property viewer (F2) |
  | `inject('theme')` — Vuetify 2's `v-app` provided `{ isDark }`, Vuetify 3 does not | 16 components stuck on light-theme styling in dark mode (C3) |
  | `v-img` default fit: cover in Vuetify 2, contain in Vuetify 3 | 14 images (C2) |
  | `VBtn` default variant `elevated`, even with `icon` | 80 icon buttons drawn as dark discs (C6) |
  | `VToolbar` defaults buttons inside it to `variant: 'text'` | 4 fabs without a background (C5) |
  | `fixed`/`absolute` button props → `position` | 5 fabs rendered inline instead of pinned (C6) |
  | Reset `* { padding: 0; margin: 0 }` | All rendered markdown (C7) |
  | Renamed classes (`v-card__text`, `v-toolbar__title`, `v-application--wrap`, `text--secondary`…) and breadcrumb `text` → `title` | Docs cards and breadcrumbs, printed sheet's print CSS, 8 templates (C8) |
  | `list-item__content` clips overflow | Account page theme legend (C3) |
  | Slot with only unrendered content still counts as present (Vue 3) | Extra library column, empty actions bars in 3 embedded dialogs (L1) |
  | Async components need `defineAsyncComponent` (Vue 3) | 17 dialogs rendered "[object Promise]" (T1) |
  | `flex-1-1` is `!important` (Vuetify 3) | Tree columns ignored their width (L2) |
  | Cards are not `v-sheet`; default surface/toolbar/drawer colours changed | Dark cards, sidebar and plain toolbars off-colour app-wide (L4) |
  | Absent Boolean-typed props become `false` (new `modelValue` prop) | Every select/toggle/checkbox/tag field in edit forms showed "false" (V1) |
  | Select items take `title`, not `text` | Options printed as "[object Object]": 99 item objects in 17 files and TriggerForm's 3 generated lists (V2) |
  | Button groups have a fixed height and hide overflow | Theme selector and every toggle cut off on phones (M1) |
  | Emphasis opacity stacks on 87% text | Light-theme labels and subtitles below 4.5:1 (DS3) |
  | `flex-1-1` is `!important` (again) | Health bar squeezed to half the row, and three other elements (H1) |
  | Subheaders are only indented inside a `v-list` | Folder card titles against the card's edge (H2) |
  | `v-model` on components is `modelValue` / `update:modelValue` | Check, advantage and spell inputs received nothing and lost every choice (K1) |
  | Cards hide overflow, so flex items shrink below their content | Log entries clipped (K2) |
  | Reactivity only through the proxy | Action result preview frozen at its first line (K2) |

- Verification (final pass): ESLint 0 errors (the 7 `_id` warnings);
  13-step interactive flow clean; 16 signed-in and 6 anonymous routes with zero console
  messages; server log clean; `meteor test` 105 passing / 0 failing / 7 pending;
  `meteor build` exit 0 (168 MB). Before/after screenshots for every item.

- Round 2: F3, F4 and D1–D4 fixed and verified (table above). Also fixed while
  checking buttons against the C6 change, all Vuetify 2 props that Vuetify 3
  ignores:
  - `SpellSlotListTile.vue`: the slot circles (`smart-btn`, also used for the
    death-save circles) drawn as filled discs: `variant="text"`.
  - `ResourceCardContent.vue`: the resource +/- buttons: `small` → `size="small"`,
    and `variant="text"`.
  - `DocEditForm.vue` "Add child": `outlined` → `variant="outlined"`.
  - `pages/LibraryBrowser.vue` subscribe button: `text` → `variant="text"`.
  - `ArchiveButton.vue`: `:text="text"` removed. In Vuetify 2 it made the button
    flat; in Vuetify 3 `text` is the button's label, and `variant="text"` (C6)
    already makes it flat.
- Round 2 verification (final pass): ESLint 0 errors (the 7 `_id` warnings); 13-step
  interactive flow clean; 17 signed-in routes (both Vexus collections, a character
  created from the collection, docs) and 8 anonymous routes with zero console
  messages and no empty page; server log clean; `meteor test` 105 passing /
  0 failing / 7 pending; `meteor build` exit 0 (only the known notice for the three
  optional server modules left external in `rspack.config.js`).
- Round 3: L1–L4, T1–T2 fixed and verified (table above). Final pass: ESLint 0
  errors (the 7 `_id` warnings); 13-step flow clean; 17 signed-in routes (both
  library pages) and 8 anonymous routes with zero console messages; all 17 lazily
  loaded dialogs resolve; tabletop selection, library "+" insert and username dialog
  driven in the browser, console clean; server log clean; `meteor test` 105 passing /
  0 failing / 7 pending; `meteor build` exit 0.
- Test data (throwaway `m3v3-5gpwe3` account only): an "Unnamed Tabletop", an "Insert
  probe …" folder in its "M3V3 probe library", and the Tree tab turned on for its
  probe character.

## Not changed, for your review

All earlier review items are decided: link contrast and light-mode bars (round 6),
red text in dark mode (round 7, DS1).
