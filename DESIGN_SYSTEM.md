Design system
=============

DiceCloud follows **Material Design**, the design system its UI library,
[Vuetify 3](https://vuetifyjs.com), implements:

- **Components** are Vuetify's, used with their Material variants (elevated,
  tonal, outlined, text) rather than restyled by hand.
- **Colour** follows Material Design 3's colour system: every colour is a *role*
  (primary, error, …) with an *on* colour for content placed on it, taken from a
  tonal palette at the tone Material assigns to that role in each theme.
- **Accessibility** is the constraint colours are chosen under: WCAG 2.1 AA, i.e.
  **4.5:1** for text, **3:1** for large text, icons and other graphics that carry
  meaning.

The palette lives in [`app/imports/client/ui/themes.js`](app/imports/client/ui/themes.js).
The browser checks in [`tests/e2e`](tests/e2e/README.md) verify it (`palette`,
`contrast` and `accessibility`).

Colour roles
------------

| Role | Light | on- (light) | Dark | on- (dark) | Used for |
|------|-------|-------------|------|------------|----------|
| `primary` | `#B91D1D` | `#FFFFFF` | `#FFB4AB` | `#690005` | Brand: main actions, links, selection, active tabs |
| `accent` | same as primary | | same as primary | | Material 2 name still used by components |
| `primary-container` | `#FFDAD6` | `#410002` | `#93000B` | `#FFDAD6` | Tinted areas that hold content |
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

Material spaces those tones for contrast. On DiceCloud's surfaces every role
reaches at least **6.0:1** as text in the light theme and **7.1:1** in the dark
theme, and **6.4:1** / **7.7:1** under its on- colour.

Neutrals
--------

DiceCloud keeps its own greys, carried over from its Vuetify 2 design:

| | Light | Dark | Where |
|--|-------|------|-------|
| `secondary` (app bars) | `#424242` | `#212121` | themes.js; app bars use the dark value in both themes |
| `surface` (cards, dialogs, menus) | `#FFFFFF` | `#303030` | themes.js |
| `drawer` (navigation drawer) | `#FFFFFF` | `#363636` | themes.js |
| `toolbar` (plain toolbars) | `#FFFFFF` | `#272727` | themes.js, the default toolbar colour in vuetify.js |
| page background | `#F6F6F6` | `#151515` | `.card-background`, styles/cardColors.css |
| raised panels | `#FAFAFA` | `#1D1D1D` | `.card-raised-background`, styles/cardColors.css |

Text on neutrals uses Vuetify's emphasis levels, not fixed greys:
`text-high-emphasis`, `text-medium-emphasis`, `text-disabled`. The light theme
raises Vuetify's medium emphasis to 0.68, so secondary text (labels, subtitles)
is 59% black, Material's 60% level, instead of 52%, which failed AA.

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
   its fill and its on- colour; no translucent overlay on top of text (see
   `SmartToggle.vue`).
5. **Dark surfaces take the dark roles.** Anything drawn dark in both themes
   (app bars, the dependency graph) uses the dark theme's values: they are made
   for dark backgrounds.

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
dialog bodies (`DialogBase.vue`, `InsertPropertyDialog.vue`), the transparent
toolbar card (`ToolbarCard.vue`), health bar tracks (`HealthBar.vue`), the
increment menu (`IncrementMenu.vue`), the disabled speed-dial button
(`LabeledFab.vue`), the inner hexagon of the roll inputs (`VerticalHex.vue`),
tree guide lines (`TreeNode.vue`, `BuildTreeNode.vue`), white input borders and
highlights (`OutlinedInput.vue`, `SmartImageInput.vue`, `CardHighlight.vue`),
scrollbars (`styles/body.css`) and the dependency graph's canvas, node text and
edges (6.8:1 and more, measured). The axe audit of the main pages flags none of
them, but it does not reach every one (the graph is drawn on a canvas); moving
them into themes.js as roles would give them one source and the palette check.
`HorizontalHex.vue` is unused.
