import chroma from 'chroma-js';

/**
 * The colours of a health bar: its filled part and its track. Shared by the
 * bar (HealthBarProgress.vue) and the value written on it (HealthBar.vue),
 * which picks a text colour that reads on them: each had its own copy, and
 * only the bar's knew the empty track of a bar without a maximum (D8), so the
 * value was written for a dark track on a light one.
 *
 * @param {{ value?: number, total?: number, color?: string,
 *   healthBarColorMid?: string, healthBarColorLow?: string }} model
 * @param {Readonly<Record<string, unknown>>} themeColors the current theme's
 *   colours: hex strings, as plugins/themes.js defines them
 */
export default function healthBarColors(model, themeColors) {
  const color = model.color || /** @type {string} */ (themeColors.primary);
  const fraction = Number(model.value) / Number(model.total);
  let bar = color;
  if (Number.isFinite(fraction) && fraction <= 0.5) {
    if (model.healthBarColorMid && model.healthBarColorLow) {
      bar = chroma.mix(model.healthBarColorLow, model.healthBarColorMid, fraction * 2).hex();
    } else if (model.healthBarColorMid) {
      bar = model.healthBarColorMid;
    }
  }
  // Without a maximum (0 / 0, nothing built yet), the track is a plain empty
  // one: in a darker shade of the bar's colour it read as a full bar (D8)
  const hasMaximum = Number.isFinite(model.total) && Number(model.total) > 0;
  const track = hasMaximum
    ? chroma(bar).darken(1.5).desaturate(1.5).hex()
    : /** @type {string} */ (themeColors['surface-light']);
  return { bar, track };
}
