#!/usr/bin/env node
/**
 * The theme's colour roles, as Vuetify applies them, against Material Design's
 * accessibility rules (WCAG AA, 4.5:1 for text), in both themes:
 * - every colour role used as text on every surface of its theme (cards, page,
 *   raised panels, drawer, plain toolbars);
 * - every colour role under its `on-` colour (filled buttons, alerts, chips);
 * - every container under its `on-` container colour.
 * Reads the CSS variables Vuetify generates, so it checks what users get.
 *
 * Then the colours users choose (a creature's, a note's...), painted as
 * backgrounds: every colour of Material's palette that the colour picker
 * draws from (190, without the accents) under the text colour the app gives
 * it (app/imports/ui/utility/onColor.mjs, loaded as it is), and as large
 * surfaces, in their tone for each theme under its text (tonal.mjs).
 */
const path = require('path');
const { pathToFileURL } = require('url');
const { openPage, visit } = require('../lib/browser');
const { createChecker, main } = require('../lib/check');

const APP = path.join(__dirname, '..', '..', '..', 'app');
const SHADES = ['lighten5', 'lighten4', 'lighten3', 'lighten2', 'lighten1', 'base', 'darken1', 'darken2', 'darken3', 'darken4'];

const ROLES = ['primary', 'accent', 'error', 'warning', 'info', 'success'];
const CONTAINERS = ['primary-container', 'error-container'];

// Runs in the page: the theme's colours, including the app's page backgrounds
// (`page` and `raised`, used as bg-page and bg-raised)
function readTheme(themeClass) {
  const root = document.querySelector(`.${themeClass}`) || document.body;
  const vars = getComputedStyle(root);
  const color = name => vars.getPropertyValue(`--v-theme-${name}`).trim();
  const names = ['primary', 'accent', 'error', 'warning', 'info', 'success', 'primary-container', 'error-container',
    'surface', 'background', 'drawer', 'toolbar', 'page', 'raised'];
  const colors = {};
  for (const name of names) {
    colors[name] = color(name);
    colors[`on-${name}`] = color(`on-${name}`);
  }
  return colors;
}

const lum = rgb => {
  const [r, g, b] = rgb.split(',').map(Number).map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

main(async () => {
  const { step, finish } = createChecker('Palette: Material colour roles (WCAG AA)');
  for (const colorScheme of ['light', 'dark']) {
    const { browser, page, messages } = await openPage({ colorScheme, signedIn: false });
    await visit(page, '/sign-in', 3000);
    const c = await page.evaluate(readTheme, `v-theme--${colorScheme}`);
    const surfaces = ['surface', 'background', 'page', 'raised', 'drawer', 'toolbar'];
    for (const role of ROLES) {
      await step(`${colorScheme}: ${role}`, messages, async () => {
        const pairs = [[`on-${role}`, c[`on-${role}`], c[role]], ...surfaces.map(s => [`text on ${s}`, c[role], c[s]])];
        const results = pairs.map(([name, fg, bg]) => ({ name, value: ratio(fg, bg) }));
        const failing = results.filter(r => r.value < 4.5);
        if (failing.length) throw new Error(failing.map(r => `${r.name} ${r.value.toFixed(2)}:1`).join(', '));
        return `lowest ${Math.min(...results.map(r => r.value)).toFixed(2)}:1`;
      });
    }
    for (const container of CONTAINERS) {
      await step(`${colorScheme}: ${container}`, messages, async () => {
        const value = ratio(c[`on-${container}`], c[container]);
        if (value < 4.5) throw new Error(`on-${container} ${value.toFixed(2)}:1`);
        return `${value.toFixed(2)}:1`;
      });
    }
    await browser.close();
  }
  await step('user colours: the palette\'s 190 colours under their text colour (onColor)', null, async () => {
    const { default: onColor, parseHex, contrastRatio } = await import(pathToFileURL(path.join(APP, 'imports/ui/utility/onColor.mjs')).href);
    const { default: colors } = await import(pathToFileURL(path.join(APP, 'node_modules/vuetify/lib/util/colors.js')).href);
    const hexes = Object.entries(colors).filter(([name]) => name !== 'shades')
      .flatMap(([, shades]) => SHADES.map(shade => shades[shade]).filter(Boolean));
    if (hexes.length !== 190) throw new Error(`expected 190 colours, found ${hexes.length}`);
    const results = hexes.map(hex => ({ hex, value: contrastRatio(parseHex(onColor(hex)), parseHex(hex)) }));
    const failing = results.filter(r => r.value < 4.5);
    if (failing.length) throw new Error(failing.map(r => `${r.hex} ${r.value.toFixed(2)}:1`).join(', '));
    return `lowest ${Math.min(...results.map(r => r.value)).toFixed(2)}:1`;
  });
  for (const dark of [false, true]) {
    const theme = dark ? 'dark' : 'light';
    await step(`user colours as large surfaces, ${theme}: the 190 colours' tone under its text (tonal.mjs)`, null, async () => {
      const { parseHex, contrastRatio } = await import(pathToFileURL(path.join(APP, 'imports/ui/utility/onColor.mjs')).href);
      const { default: tonalSurface } = await import(pathToFileURL(path.join(APP, 'imports/ui/utility/tonal.mjs')).href);
      const { default: colors } = await import(pathToFileURL(path.join(APP, 'node_modules/vuetify/lib/util/colors.js')).href);
      const hexes = Object.entries(colors).filter(([name]) => name !== 'shades')
        .flatMap(([, shades]) => SHADES.map(shade => shades[shade]).filter(Boolean));
      const results = hexes.map(hex => {
        const { background, text } = tonalSurface(hex, dark);
        return { hex, value: contrastRatio(parseHex(text), parseHex(background)) };
      });
      const failing = results.filter(r => r.value < 4.5);
      if (failing.length) throw new Error(failing.map(r => `${r.hex} ${r.value.toFixed(2)}:1`).join(', '));
      return `${results.length} colours, lowest ${Math.min(...results.map(r => r.value)).toFixed(2)}:1`;
    });
  }
  finish();
});
