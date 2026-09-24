#!/usr/bin/env node
/**
 * axe-core's WCAG 2 AA colour-contrast rule on the main pages, in both themes:
 * every piece of text axe can measure must reach 4.5:1 (3:1 when large).
 * Disabled controls are exempt under WCAG and skipped by axe.
 * Extra routes: E2E_EXTRA_ROUTES=/a,/b (signed in).
 */
const { default: AxeBuilder } = require('@axe-core/playwright');
const { openPage, visit } = require('../lib/browser');
const { getTestUser } = require('../lib/db');
const { createChecker, main } = require('../lib/check');

async function audit(page) {
  const result = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  return result.violations.flatMap(v => v.nodes.map(n => {
    const data = n.any[0]?.data || {};
    const text = (n.target || []).join(' ').slice(-60);
    return `${text} — ${data.contrastRatio}:1 (${data.fgColor} on ${data.bgColor})`;
  }));
}

main(async () => {
  const { creatureId } = await getTestUser();
  const signedIn = ['/character-list', `/character/${creatureId}`, '/library', '/community-libraries', '/account',
    '/docs/property', ...(process.env.E2E_EXTRA_ROUTES ? process.env.E2E_EXTRA_ROUTES.split(',') : [])];
  const signedOut = ['/', '/sign-in', '/register', '/about'];
  const { step, finish } = createChecker('Accessibility: axe-core colour contrast (WCAG AA)');
  for (const colorScheme of ['dark', 'light']) {
    for (const [routes, isSignedIn] of [[signedIn, true], [signedOut, false]]) {
      const { browser, page, messages } = await openPage({ colorScheme, signedIn: isSignedIn });
      for (const route of routes) {
        await step(`${colorScheme}: ${route.replace(creatureId, ':id')}`, messages, async () => {
          await visit(page, route, 5000);
          const violations = await audit(page);
          if (violations.length) {
            const error = new Error(`${violations.length} element(s) below the required contrast`);
            error.details = violations.slice(0, 15);
            throw error;
          }
        });
      }
      await browser.close();
    }
  }
  finish();
});
