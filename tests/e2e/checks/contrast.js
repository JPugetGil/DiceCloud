#!/usr/bin/env node
/**
 * WCAG contrast of the places the theme colours were chosen for, in both
 * themes: links (on the docs), the selected option of a toggle (Account page),
 * and the text on the app bars (character list and character sheet). Text must
 * reach 4.5:1 (AA); icons 3:1. Selects "Match device theme" on the test
 * account's Account page to have a selected option to measure.
 */
const { openPage, visit } = require('../lib/browser');
const { getTestUser } = require('../lib/db');
const { createChecker, main } = require('../lib/check');

// Runs in the page: contrast of each matching element against what is really
// behind it (nearest opaque background, plus a button's state overlay)
function measure(selector) {
  const parse = c => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const over = (fg, bg, a = fg.a) => ({ r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const results = [];
  for (const el of document.querySelectorAll(selector)) {
    if (!el.getBoundingClientRect().width) continue;
    let node = el, bg = null;
    while (node && !bg) {
      const b = parse(getComputedStyle(node).backgroundColor);
      if (b.a > 0.5) bg = over(b, { r: 255, g: 255, b: 255 });
      node = node.parentElement;
    }
    bg = bg || { r: 255, g: 255, b: 255, a: 1 };
    const overlay = el.closest('.v-btn')?.querySelector(':scope > .v-btn__overlay');
    if (overlay) {
      const o = getComputedStyle(overlay);
      bg = over(parse(o.backgroundColor), bg, +o.opacity * parse(o.backgroundColor).a);
    }
    const fg = over(parse(getComputedStyle(el).color), bg);
    // Icons, and buttons that only hold an icon, need 3:1 rather than 4.5:1
    const icon = el.matches('i, .v-icon') || (!el.innerText.trim() && !!el.querySelector('.v-icon'));
    results.push({ text: (el.innerText || el.className.match(/mdi-[\w-]+/)?.[0] || '').trim().slice(0, 30), icon, ratio: +ratio(fg, bg).toFixed(2) });
  }
  return results;
}

function assertAll(results, what) {
  if (!results.length) throw new Error(`no ${what} found to measure`);
  const failing = results.filter(r => r.ratio < (r.icon ? 3 : 4.5));
  const min = Math.min(...results.map(r => r.ratio));
  if (failing.length) throw new Error(failing.map(r => `"${r.text}" ${r.ratio}:1`).join(', '));
  return min;
}

main(async () => {
  const { creatureId } = await getTestUser();
  const { step, finish } = createChecker('Contrast (WCAG AA)');
  for (const colorScheme of ['dark', 'light']) {
    const { browser, page, messages } = await openPage({ colorScheme });
    await step(`${colorScheme}: links in the docs`, messages, async () => {
      await visit(page, '/docs/property');
      return `lowest ${assertAll(await page.evaluate(measure, '.v-application a:not([class])'), 'links')}:1`;
    });
    await step(`${colorScheme}: selected toggle option`, messages, async () => {
      await visit(page, '/account');
      await page.locator('.theme-preference .v-btn', { hasText: 'Match device theme' }).click();
      await page.waitForTimeout(2500);
      // move the pointer away: the hover overlay is not the resting state
      await page.mouse.move(0, 0);
      await page.waitForTimeout(500);
      return `lowest ${assertAll(await page.evaluate(measure, '.smart-toggle-group .v-btn--active .v-btn__content'), 'selected option')}:1`;
    });
    for (const route of ['/character-list', `/character/${creatureId}`]) {
      await step(`${colorScheme}: app bar text on ${route.replace(creatureId, ':id')}`, messages, async () => {
        await visit(page, route);
        const selector = '.v-app-bar .v-toolbar-title, .v-app-bar .v-tab, .v-app-bar .v-btn__content, .v-app-bar i.v-icon';
        return `lowest ${assertAll(await page.evaluate(measure, selector), 'app bar text')}:1 (icons need 3:1, text 4.5:1)`;
      });
    }
    await browser.close();
  }
  finish();
});
