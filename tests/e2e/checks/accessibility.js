#!/usr/bin/env node
/**
 * axe-core's WCAG 2.1 A and AA rules (names, roles, keyboard, contrast...) on
 * the main pages, in both themes, on a computer's width and a phone's. Text
 * must reach 4.5:1 (3:1 when large); disabled controls are exempt under WCAG
 * and skipped by axe.
 *
 * axe leaves out text it cannot measure, such as card titles under the hover
 * highlight (CardHighlight): the Journal's notes, painted in the colour their
 * author chose, are measured here instead, title against card.
 *
 * Extra routes: E2E_EXTRA_ROUTES=/a,/b (signed in).
 */
const { default: AxeBuilder } = require('@axe-core/playwright');
const { openPage, visit } = require('../lib/browser');
const { getTestUser, withDb } = require('../lib/db');
const { createChecker, main } = require('../lib/check');

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const WIDTHS = [1400, 390];

async function audit(page) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => {
    const target = (n.target || []).join(' ').slice(-70);
    if (v.id === 'color-contrast') {
      const data = n.any[0]?.data || {};
      return `${v.id}: ${target} — ${data.contrastRatio}:1 (${data.fgColor} on ${data.bgColor})`;
    }
    return `${v.id}: ${target}`;
  }));
}

const lum = ([r, g, b]) => [r, g, b].map(v => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const rgb = css => css.match(/[\d.]+/g).slice(0, 3).map(Number);

// The test account's character with the most coloured notes, if any
async function characterWithColouredNotes(userId) {
  return withDb(async db => {
    const creatures = await db.collection('creatures')
      .find({ owner: userId, removed: { $ne: true } }, { projection: { _id: 1 } }).toArray();
    const [found] = await db.collection('creatureProperties').aggregate([
      { $match: { 'root.id': { $in: creatures.map(c => c._id) }, type: 'note', color: { $exists: true, $ne: null },
        removed: { $ne: true }, inactive: { $ne: true } } },
      { $group: { _id: '$root.id', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray();
    return found?._id;
  });
}

// Runs in the page: each card of the open tab painted in a colour of its own
function colouredCards() {
  return [...document.querySelectorAll('.v-window-item--active .v-card')]
    .filter(card => card.style.backgroundColor)
    .map(card => {
      const title = card.querySelector('.v-card-title') || card;
      return { name: title.textContent.trim().slice(0, 40), fg: getComputedStyle(title).color, bg: card.style.backgroundColor };
    });
}

main(async () => {
  const { userId, creatureId } = await getTestUser();
  const notesCreatureId = await characterWithColouredNotes(userId);
  const signedIn = ['/character-list', `/character/${creatureId}`, '/library', '/community-libraries', '/account',
    '/docs/property', ...(process.env.E2E_EXTRA_ROUTES ? process.env.E2E_EXTRA_ROUTES.split(',') : [])];
  const signedOut = ['/', '/sign-in', '/register', '/about'];
  const { step, finish } = createChecker('Accessibility: axe-core WCAG 2.1 A and AA, at 1400 and 390 px');
  for (const colorScheme of ['dark', 'light']) {
    for (const width of WIDTHS) {
      for (const [routes, isSignedIn] of [[signedIn, true], [signedOut, false]]) {
        const { browser, page, messages } = await openPage({
          colorScheme, signedIn: isSignedIn, viewport: { width, height: 900 },
        });
        for (const route of routes) {
          await step(`${colorScheme}, ${width} px: ${route.replace(creatureId, ':id')}`, messages, async () => {
            await visit(page, route, 5000);
            const violations = await audit(page);
            if (violations.length) {
              const error = new Error(`${violations.length} violation(s)`);
              error.details = violations.slice(0, 20);
              throw error;
            }
          });
        }
        await browser.close();
      }
    }
    const { browser, page, messages } = await openPage({ colorScheme });
    await step(`${colorScheme}: coloured notes on the Journal tab (title against card, 4.5:1)`, messages, async () => {
      if (!notesCreatureId) return 'skipped: no coloured note on the test account\'s characters';
      await visit(page, `/character/${notesCreatureId}`, 5000);
      await page.evaluate(id => {
        const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
        pinia._s.get('app').setTabForCharacterSheet({ id, tab: 'journal' });
      }, notesCreatureId);
      await page.waitForTimeout(2500);
      const cards = await page.evaluate(colouredCards);
      const measured = cards.map(card => ({ ...card, ratio: ratio(rgb(card.fg), rgb(card.bg)) }));
      const failing = measured.filter(card => card.ratio < 4.5);
      if (failing.length) {
        const error = new Error(`${failing.length} of ${measured.length} note(s) below 4.5:1`);
        error.details = failing.map(card => `"${card.name}" ${card.ratio.toFixed(2)}:1 (${card.fg} on ${card.bg})`);
        throw error;
      }
      return measured.length
        ? `${measured.length} note(s), lowest ${Math.min(...measured.map(card => card.ratio)).toFixed(2)}:1`
        : 'no coloured note shown';
    });
    await browser.close();
  }
  finish();
});
