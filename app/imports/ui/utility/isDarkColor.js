import onColor, { WHITE } from '/imports/ui/utility/onColor.mjs';

/**
 * Whether a colour takes white text, by WCAG contrast (onColor): what decides
 * the theme (`dark` or `light`) of a component painted in a user's colour.
 * null when the colour is not a hex colour.
 */
export default function isDarkColor(hexColor) {
  const on = onColor(hexColor);
  if (!on) return null;
  return on === WHITE;
}
