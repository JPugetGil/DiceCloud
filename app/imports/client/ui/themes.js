/**
 * DiceCloud's colours follow Material Design 3's colour system, the design
 * system Vuetify implements (see DESIGN_SYSTEM.md at the repository root).
 *
 * Each colour role comes from a tonal palette generated from one of the app's
 * seed colours, at the tone Material assigns to the role:
 * - light theme: role tone 40, `on-` colour tone 100; containers tone 90 / 10
 * - dark theme: role tone 80, `on-` colour tone 20; containers tone 30 / 90
 * Material spaces those tones so that text passes WCAG AA (4.5:1). Measured
 * against this app's surfaces: every role reaches 6.0:1 as text in the light
 * theme and 7.1:1 in the dark theme, and 6.4:1 / 7.7:1 under its `on-` colour.
 *
 * Seeds (DiceCloud's earlier palette): primary #B71C1C, error #FF6D00,
 * warning #FFB300, info #5C6BC0, success #43A047. Generated with Google's
 * @material/material-color-utilities (TonalPalette.fromInt(seed).tone(n)).
 *
 * The neutrals keep DiceCloud's own greys (from Vuetify 2): `secondary` for app
 * bars, `surface` for cards, `drawer` and `toolbar` for the navigation drawer
 * and plain toolbars (the default toolbar colour is set in vuetify.js).
 */
const themes = {
  light: {
    dark: false,
    colors: {
      primary: '#B91D1D',
      'on-primary': '#FFFFFF',
      'primary-container': '#FFDAD6',
      'on-primary-container': '#410002',
      secondary: '#424242',
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
      drawer: '#FFFFFF',
      toolbar: '#FFFFFF',
    },
    variables: {
      // Vuetify stacks this on text already at 87%, which gave labels and
      // subtitles 52% black: #7A7A7A, 4.3:1 on white. 0.68 gives 59%, Material's
      // 60% medium-emphasis text: 5.6:1 on white, 5.4:1 on the #F6F6F6 page
      'medium-emphasis-opacity': 0.68,
    },
  },
  dark: {
    dark: true,
    colors: {
      primary: '#FFB4AB',
      'on-primary': '#690005',
      'primary-container': '#93000B',
      'on-primary-container': '#FFDAD6',
      secondary: '#212121',
      accent: '#FFB4AB',
      'on-accent': '#690005',
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
      surface: '#303030',
      drawer: '#363636',
      toolbar: '#272727',
    },
  }
}

export default themes;
