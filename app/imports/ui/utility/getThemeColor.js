import vuetify from '/imports/ui/plugins/vuetify';

/**
 * The hex value a theme color resolves to in the active theme.
 */
export default function (color) {
  return vuetify.theme.current.value.colors[color];
}
