Design system
=============

DiceCloud follows **Material Design**, the design system its UI library,
[Vuetify 4](https://vuetifyjs.com), implements:

- **Components** are Vuetify's, used with their Material variants (elevated,
  tonal, outlined, text) rather than restyled by hand.
- **Colour** follows Material Design 3's colour system: every colour is a *role*
  (primary, error, …) with an *on* colour for content placed on it, taken from a
  tonal palette at the tone Material assigns to that role in each theme.
- **Accessibility** is the constraint colours are chosen under: WCAG 2.1 AA, i.e.
  **4.5:1** for text, **3:1** for large text, icons and other graphics that carry
  meaning.

The palette lives in [`app/imports/ui/plugins/themes.js`](app/imports/ui/plugins/themes.js).
The browser checks in [`tests/e2e`](tests/e2e/README.md) verify it (`palette`,
`contrast` and `accessibility`).

Colour roles
------------

| Role | Light | on- (light) | Dark | on- (dark) | Used for |
|------|-------|-------------|------|------------|----------|
| `primary` | `#B91D1D` | `#FFFFFF` | `#FF7165` | `#410002` | Brand: main actions, links, selection, active tabs, roll buttons |
| `accent` | same as primary | | same as primary | | Material 2 name still used by components |
| `primary-container` | `#FFDAD6` | `#410002` | `#93000B` | `#FFDAD6` | Tinted areas that hold content, the chosen option of a toggle |
| `error` | `#9F4200` | `#FFFFFF` | `#FFB692` | `#562000` | Errors, validation messages |
| `error-container` | `#FFDBCB` | `#341100` | `#7A3000` | `#FFDBCB` | Error areas that hold content |
| `warning` | `#7E5700` | `#FFFFFF` | `#FFBA38` | `#432C00` | Warnings |
| `info` | `#4858AB` | `#FFFFFF` | `#BAC3FF` | `#15267B` | Information |
| `success` | `#006E1C` | `#FFFFFF` | `#7DDC7A` | `#00390A` | Success |

Each role is generated from a seed, DiceCloud's earlier colour for it (primary
`#B71C1C`, error `#FF6D00`, warning `#FFB300`, info `#5C6BC0`, success
`#43A047`), at Material's tones:

| | Role | on- role | Container | on- container |
|--|------|----------|-----------|---------------|
| Light | 40 | 100 | 90 | 10 |
| Dark | 80 | 20 | 30 | 90 |

Except the dark theme's `primary`: tone **65**, with tone 10 on it. Tone 80 of a
crimson is a pale salmon, which made every filled button, active tab and health
bar pink; tone 65 stays red and still reads at 5.8:1 on the lightest dark
surface.

Material spaces those tones for contrast. Measured by the `palette` check, on
DiceCloud's surfaces and under its on- colour, every role reaches at least
**5.9:1** in the light theme; in the dark theme primary reaches **5.8:1** and the
other roles **7.2:1**.

Neutrals
--------

Greys are warm, so that they sit with the crimson instead of against it. The
dark theme's are the primary seed's hue at chroma 2 (a warm ink); at light
tones any chroma of that hue reads pink, so the light theme uses Tailwind's
"stone" greys, which are nearly neutral.

| | Light | Dark | Where |
|--|-------|------|-------|
| `secondary` (app bars, dialog toolbars) | `#44403C` | `#221F1E` | themes.js; app bars use the dark value in both themes |
| `surface` (cards, dialogs, menus) | `#FFFFFF` | `#262322` | themes.js |
| `drawer` (navigation drawer) | `#FAFAF9` | `#1E1B1A` | themes.js |
| `toolbar` (plain toolbars) | `#FFFFFF` | `#1E1B1A` | themes.js, the default toolbar colour in vuetify.js |
| `background`, `page` (behind a page's cards) | `#F5F5F4` | `#161312` | themes.js; `bg-page` |
| `raised` (panels raised from the page) | `#FAFAF9` | `#1A1716` | themes.js; `bg-raised` |
| `surface-light` (tracks, filled fields) | `#E7E5E4` | `#383433` | themes.js |
| `surface-variant` (tooltips) | `#292524` | `#E9E1DF` | themes.js |
| `surface-bright` (a switch's thumb when off) | `#FFFFFF` | `#CCC5C4` | themes.js; Vuetify's dark default is a lavender from none of our palettes |

Text on neutrals uses Vuetify's emphasis levels, not fixed greys:
`text-high-emphasis`, `text-medium-emphasis`, `text-disabled`. The light theme
raises Vuetify's medium emphasis to 0.68, so secondary text (labels, subtitles)
is at Material's 60% level instead of 52%, which failed AA.

Rules
-----

1. **Use roles, not colour values.** In templates `color="primary"`,
   `class="text-error"`, `bg-warning`; in CSS `rgb(var(--v-theme-primary))`;
   in scripts `useTheme().current.value.colors.primary`. A hard-coded colour
   does not follow the theme, and nothing checks its contrast.
2. **Put content on a colour with its on- colour.** Vuetify does this for
   components given a `color`. For user-chosen colours (a creature's or a
   property's), pick black or white text with `isDarkColor`, as the character
   sheet toolbar and health bars do.
3. **Do not rely on colour alone.** Links stay underlined; errors and warnings
   come with text or an icon.
4. **Keep selected and active states readable.** A selected option is shown by
   its fill and its on- colour, plus a mark that is not colour (a toggle's
   check mark); no translucent overlay on top of text (see `SmartToggle.vue`).
5. **Dark surfaces take the dark roles.** Anything drawn dark in both themes
   (app bars, the dependency graph) uses the dark theme's values: they are made
   for dark backgrounds.

Layout and components
---------------------

- **App bars** are Vuetify's default height (64px) in the `secondary` ink. Only
  the character sheet's is extended, for its tabs: an app bar reserves its
  extension row even when nothing fills it. Heights below the app bar come from
  Vuetify's layout variables (`calc(100dvh - var(--v-layout-top) -
  var(--v-layout-bottom))`), never a fixed number of pixels.
- **Cards** are rounded `lg` (8px, a default in vuetify.js).
- **The navigation drawer** holds the brand, the account, the main pages
  (active one tinted with primary), the user's characters, then help,
  community and legal pages in a compact list.
- **Roll buttons** (`properties/shared/CheckButton.vue`) are tonal primary
  buttons marked with a d20 (`mdi-dice-d20-outline`) and a tooltip naming the
  roll. Abilities and check cards use the `tile` shape, which holds the large
  value; skills and saves the `pill` shape, which holds the modifier. The row
  around them opens the property, so the two targets never look alike. Without
  edit permission the value shows as plain text.
- **Secondary actions** beside a list are text buttons with an icon; a page's
  main creation action is a floating button, extended with its label from
  small screens up. An empty list shows a `v-empty-state`.
- **Forms that stand alone** (sign in, register) sit in a centred card: one
  primary button, other routes as text buttons, errors in a tonal `v-alert`.

Inputs
------

Every input is Vuetify's, in its `outlined` variant, and lines up with the
others: a wrapper that forwards a slot to a Vuetify input forwards it only when
the parent fills it (`<template v-if="$slots.prepend" #prepend>`), since an
empty prepend or append slot still reserves 16px beside the field.

- **Focus and selection** take the primary colour: focused fields, checked
  switches, checkboxes and radios, sliders. vuetify.js sets it as their default
  (Vuetify leaves them grey).
- **Content that is not typed into** (icon and colour pickers, images, the
  child property tree, a linked property) sits in `OutlinedInput.vue`, which
  draws Vuetify's own field outline and notched label around it, so that its
  border, hover and messages match the text fields beside it.
- **A choice between a few options** is a toggle (`SmartToggle.vue`), drawn as
  Material's segmented button: an outlined pill with its label above, the chosen
  option filled with `primary-container` and marked with a check mark. Where
  space is short the options wrap their labels and drop their icons.
- **An icon inside a field** is an `inner` one (`append-inner-icon`,
  `prepend-inner-icon`). Vuetify's `append-icon` draws outside the field
  (Vuetify 2 drew it inside).

Styling with Vuetify 4
----------------------

Vuetify 4 puts all of its styles in CSS layers (`vuetify-core`,
`vuetify-components`, `vuetify-overrides`, `vuetify-utilities`,
`vuetify-final`). The app's own CSS is not in a layer, so it beats every
Vuetify rule, utilities included, whatever the specificity:

1. **Prefer Vuetify.** A component prop, a theme colour, `v-defaults-provider`
   for nested components, or a utility class (`text-medium-emphasis`,
   `text-mono`, `flex-1-1`, `ma-0`, `cursor-pointer`, …) before a CSS rule.
2. **No `!important`.** An unlayered rule already beats Vuetify; `!important`
   is only for another app rule or an inline style.
3. **A scoped rule beats the utility on the same element.** `.foo { flex-grow:
   0 }` wins over `class="foo flex-1-1"`; do not give an element a utility and
   a rule for the same property.
4. **A global look for a component is a Vuetify default** (`defaults` in
   vuetify.js: avatars are transparent unless coloured, focused fields take
   the primary colour). An override that utilities must still beat, if one is
   ever needed, goes in Vuetify's overrides layer (`@layer vuetify-overrides`),
   so that `bg-*` and friends keep working.
5. **Native elements keep the browser's margins.** Vuetify 4's reset no longer
   zeroes every margin: give `<p>`, headings and lists their spacing with
   utilities (`my-0`, `mb-2`). Rendered markdown gets Vuetify's classes from
   `MarkdownText.vue`'s renderer (typography, spacing, `v-divider`, `v-table`,
   `v-code`); `stylesheets/markdown.css` keeps only what classes cannot say.
6. **Global stylesheets hold only what Vuetify has no equivalent for**
   (`app/imports/ui/stylesheets`): thin scrollbars and their reserved gutter,
   the dialog stack's scroll lock, large numeric inputs, a few markdown rules
   and the dice the log draws in rolls (`logRolls.css`). Scrollbar colours
   come from the theme: Vuetify sets `color-scheme`.
7. **Register a Vuetify component before using it.** Only the components
   listed in `app/imports/ui/plugins/vuetifyComponents.js` are in the bundle,
   with their styles; a missing one renders as an unknown `<v-...>` element and
   Vue warns "Failed to resolve component".

Typography uses Material 3's type scale (`text-display-*`, `text-headline-*`,
`text-title-*`, `text-body-*`, `text-label-*`), and buttons keep the case their
label is written in: write labels in sentence case.

Adding or changing a colour
---------------------------

Generate the role from a seed with Google's
[material-color-utilities](https://github.com/material-foundation/material-color-utilities),
the library Material's own tools use:

```js
// tones.mjs, after `npm install @material/material-color-utilities` in a scratch folder
import { TonalPalette } from './node_modules/@material/material-color-utilities/palettes/tonal_palette.js';
import { argbFromHex, hexFromArgb } from './node_modules/@material/material-color-utilities/utils/string_utils.js';

const palette = TonalPalette.fromInt(argbFromHex('#B71C1C'));    // the seed
const tone = n => hexFromArgb(palette.tone(n));
// light: role tone(40), on tone(100); dark: role tone(80), on tone(20)
// containers: light tone(90) / tone(10), dark tone(30) / tone(90)
```

(Import the files by their path in `node_modules`, as above: in version 0.4.0 the
package's entry point does not load under Node, and its subpaths are not
exported.)

Add the role to both themes in `themes.js`, with its `on-` colour, then run the
browser checks: `palette` verifies every role against every surface, and
`accessibility` runs axe-core's WCAG contrast rule over the main pages in both
themes.

Known exceptions
----------------

Colours still written as values in components, all neutral greys or white:
health bar tracks (`HealthBar.vue`), the printed character sheet (print colours), the
disabled speed-dial button (`LabeledFab.vue`), the inner hexagon of the roll
inputs (`VerticalHex.vue`), tree guide lines (`TreeNode.vue`,
`BuildTreeNode.vue`), the white highlight of `CardHighlight.vue`, and the
dependency graph's canvas, node text and edges (6.8:1 and more, measured).
The axe audit of the main pages flags none of
them, but it does not reach every one (the graph is drawn on a canvas); moving
them into themes.js as roles would give them one source and the palette check.
