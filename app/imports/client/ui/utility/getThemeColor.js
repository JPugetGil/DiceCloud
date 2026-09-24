import vuetify from '/imports/client/ui/vuetify';

/**
 * The hex value a theme color resolves to in the active theme.
 * Vuetify 3 keeps the active theme in `theme.current`, with its colors under
 * `colors`; Vuetify 2's `framework.theme.themes[dark|light]` is gone.
 */
export default function (color) {
  return vuetify.theme.current.value.colors[color];
}
