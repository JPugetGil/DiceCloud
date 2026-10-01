/**
 * DiceCloud's colours follow Material Design 3's colour system, the design
 * system Vuetify implements (see DESIGN_SYSTEM.md at the repository root).
 *
 * Each colour role comes from a tonal palette generated from one of the app's
 * seed colours, at the tone Material assigns to the role:
 * - light theme: role tone 40, `on-` colour tone 100; containers tone 90 / 10
 * - dark theme: role tone 80, `on-` colour tone 20; containers tone 30 / 90
 * except the dark theme's primary, at tone 65 with tone 10 on it: tone 80 of a
 * crimson is a pale salmon, which made every button, tab and health bar pink.
 * Tone 65 stays red and still reads at 5.8:1 or more on every dark surface.
 * Material spaces those tones so that text passes WCAG AA (4.5:1). Measured
 * by the `palette` browser check, against this app's surfaces and under each
 * role's `on-` colour: every role reaches 5.9:1 in the light theme; in the dark
 * theme primary reaches 5.8:1 and the other roles 7.2:1.
 *
 * Seeds (DiceCloud's earlier palette): primary #B71C1C, error #FF6D00,
 * warning #FFB300, info #5C6BC0, success #43A047. Generated with Google's
 * @material/material-color-utilities (TonalPalette.fromInt(seed).tone(n)).
 *
 * The neutrals are warm greys. The dark theme's are the primary seed's hue at
 * chroma 2 (TonalPalette.fromHueAndChroma(24.8, 2)), an ink that sits with the
 * crimson. At light tones any chroma of that hue reads pink, so the light
 * theme takes Tailwind's "stone" greys (#FAFAF9, #F5F5F4, #E7E5E4, #44403C,
 * #292524), nearly neutral. `secondary` is the ink of app bars and
 * dialog toolbars (app bars use the dark theme's in both themes), `surface`
 * is cards and dialogs, `drawer` and `toolbar` the navigation drawer and plain
 * toolbars (the default toolbar colour is set in vuetify.js), `background` and
 * `page` behind cards (`bg-page`), `raised` for panels raised from the page
 * (`bg-raised`), `surface-light` for tracks and filled areas, `surface-variant`
 * for tooltips, and `surface-bright` for the thumb of a switch that is off.
 */
const themes = {
  light: {
    dark: false,
    colors: {
      primary: '#B91D1D',
      'on-primary': '#FFFFFF',
      'primary-container': '#FFDAD6',
      'on-primary-container': '#410002',
      // Dialog toolbars (app bars use the dark theme's)
      secondary: '#44403C',
      'on-secondary': '#FFFFFF',
      // A Material Design 2 name components still use: the same as primary
      accent: '#B91D1D',
      'on-accent': '#FFFFFF',
      error: '#9F4200',
      'on-error': '#FFFFFF',
      'error-container': '#FFDBCB',
      'on-error-container': '#341100',
      warning: '#7E5700',
      'on-warning': '#FFFFFF',
      info: '#4858AB',
      'on-info': '#FFFFFF',
      success: '#006E1C',
      'on-success': '#FFFFFF',
      // The page behind cards, the drawer and raised panels, cards. Text on
      // them stays Vuetify's black: medium-emphasis text is it at 59%, and a
      // lighter ink (stone 900) left labels at 4.3:1 on the page
      background: '#F5F5F4',
      surface: '#FFFFFF',
      drawer: '#FAFAF9',
      toolbar: '#FFFFFF',
      page: '#F5F5F4',
      raised: '#FAFAF9',
      // Tracks and filled fields, tooltips
      'surface-light': '#E7E5E4',
      'surface-variant': '#292524',
      'on-surface-variant': '#FAFAF9',
      // The thumb of a switch that is off (Vuetify's own light default)
      'surface-bright': '#FFFFFF',
      'on-surface-bright': '#000000',
    },
    variables: {
      // Vuetify stacks this on text already at 87%, which gave labels and
      // subtitles 52% black: #7A7A7A, 4.3:1 on white. 0.68 gives 59%, Material's
      // 60% medium-emphasis text: 5.6:1 on white, 5.4:1 on the #F5F5F4 page
      'medium-emphasis-opacity': 0.68,
    },
  },
  dark: {
    dark: true,
    colors: {
      primary: '#FF7165',
      'on-primary': '#410002',
      'primary-container': '#93000B',
      'on-primary-container': '#FFDAD6',
      // The app bars' ink, neutral tone 12
      secondary: '#221F1E',
      'on-secondary': '#FFFFFF',
      accent: '#FF7165',
      'on-accent': '#410002',
      error: '#FFB692',
      'on-error': '#562000',
      'error-container': '#7A3000',
      'on-error-container': '#FFDBCB',
      warning: '#FFBA38',
      'on-warning': '#432C00',
      info: '#BAC3FF',
      'on-info': '#15267B',
      success: '#7DDC7A',
      'on-success': '#00390A',
      // Neutral tones 6 (page), 8 (raised panels), 10 (drawer, toolbars),
      // 14 (cards, dialogs, menus)
      background: '#161312',
      'on-background': '#E9E1DF',
      surface: '#262322',
      'on-surface': '#E9E1DF',
      drawer: '#1E1B1A',
      toolbar: '#1E1B1A',
      page: '#161312',
      raised: '#1A1716',
      // Tracks, filled fields (tone 22) and tooltips (tone 90)
      'surface-light': '#383433',
      'surface-variant': '#E9E1DF',
      'on-surface-variant': '#332F2F',
      // The thumb of a switch that is off. Vuetify's dark default is a lavender
      // (#CCBFD6) from none of our palettes; this is neutral tone 80
      'surface-bright': '#CCC5C4',
      'on-surface-bright': '#000000',
    },
  }
}

export default themes;
