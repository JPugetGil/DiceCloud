#!/usr/bin/env node
/**
 * The theme's colour roles, as Vuetify applies them, against Material Design's
 * accessibility rules (WCAG AA, 4.5:1 for text), in both themes:
 * - every colour role used as text on every surface of its theme (cards, page,
 *   raised panels, drawer, plain toolbars);
 * - every colour role under its `on-` colour (filled buttons, alerts, chips);
 * - every container under its `on-` container colour.
 * Reads the CSS variables Vuetify generates, so it checks what users get.
 */
const { openPage, visit } = require('../lib/browser');
const { createChecker, main } = require('../lib/check');

const ROLES = ['primary', 'accent', 'error', 'warning', 'info', 'success'];
const CONTAINERS = ['primary-container', 'error-container'];

// Runs in the page: the theme's colours, and the app's page backgrounds
// (card-background, card-raised-background) rendered inside that theme
function readTheme(themeClass) {
  const root = document.querySelector(`.${themeClass}`) || document.body;
  const vars = getComputedStyle(root);
  const color = name => vars.getPropertyValue(`--v-theme-${name}`).trim();
  const background = className => {
    const probe = document.createElement('div');
    probe.className = className;
    root.appendChild(probe);
    const value = getComputedStyle(probe).backgroundColor.match(/[\d.]+/g).slice(0, 3).join(',');
    probe.remove();
    return value;
  };
  const names = ['primary', 'accent', 'error', 'warning', 'info', 'success', 'primary-container', 'error-container',
    'surface', 'background', 'drawer', 'toolbar'];
  const colors = {};
  for (const name of names) {
    colors[name] = color(name);
    colors[`on-${name}`] = color(`on-${name}`);
  }
  colors.page = background('card-background');
  colors.raised = background('card-raised-background');
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
  finish();
});
