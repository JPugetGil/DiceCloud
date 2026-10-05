import onColor, { WHITE } from '/imports/ui/utility/onColor.mjs';
import tonalSurface from '/imports/ui/utility/tonal.mjs';

/**
 * The props a Vuetify component takes to be painted in a colour the user
 * chose: the colour, the theme its content follows, and the text colour,
 * given explicitly. Vuetify would pick the text itself by APCA, which favours
 * white: 49 of the colour picker's colours then fell below 4.5:1
 * (DESIGN_SYSTEM.md, rule 2). Nothing for no colour, or one that is not hex
 * (a theme colour's name, which Vuetify pairs with its on- colour).
 *
 *   <v-card v-bind="userColorProps(model.color)">
 */
export default function userColorProps(color, colorProp = 'color') {
  if (!color) return {};
  const on = onColor(color);
  if (!on) return { [colorProp]: color };
  return {
    [colorProp]: color,
    theme: on === WHITE ? 'dark' : 'light',
    style: { color: on },
  };
}

/**
 * The props for a large surface the user coloured (a character's bar, a
 * card's header or background, a note, a dialog's toolbar): the colour's
 * tone for the theme rather than the colour itself (D2, tonal.mjs), under
 * light text. Small marks (a chip, an avatar) keep the colour as chosen, with
 * userColorProps. `dark`: the current theme is dark.
 *
 *   const userSurface = useUserSurface();
 *   <v-toolbar v-bind="userSurface(model.color)">
 */
export function userSurfaceProps(color, dark, colorProp = 'color') {
  const surface = tonalSurface(color, dark);
  if (!surface) return userColorProps(color, colorProp);
  return {
    [colorProp]: surface.background,
    theme: 'dark',
    style: { color: surface.text },
  };
}
