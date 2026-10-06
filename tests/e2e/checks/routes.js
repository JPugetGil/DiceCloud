#!/usr/bin/env node
/**
 * Loads every main page, signed in and signed out, and fails on any console
 * error or warning, an empty page, "[object Promise]" rendered as text, or a
 * list subheader without its indent.
 * Extra routes: E2E_EXTRA_ROUTES=/a,/b (signed in).
 */
const { openPage, visit } = require('../lib/browser');
const { withDb, getTestUser } = require('../lib/db');
const { createChecker, main } = require('../lib/check');

const SIGNED_IN = ['/', '/character-list', '/library', '/community-libraries', '/account', '/my-files',
  '/docs', '/docs/property', '/about', '/privacy', '/terms'];
const SIGNED_OUT = ['/', '/sign-in', '/register', '/reset-password', '/docs', '/docs/api/login', '/about',
  '/community-libraries', '/privacy', '/terms'];

async function checkRoutes(label, routes, signedIn) {
  const { browser, page, messages } = await openPage({ signedIn });
  const { step, finish } = createChecker(`Routes, ${label}`);
  for (const route of routes) {
    await step(route, messages, async () => {
      await visit(page, route);
      const text = await page.evaluate(() => document.body.innerText.trim());
      if (!text) throw new Error('empty page');
      if (text.includes('[object Promise]')) throw new Error('renders "[object Promise]"');
      // Vuetify indents list subheaders only inside a v-list; the app gives them
      // the same 16px elsewhere (card titles would sit against the card's edge)
      const flush = await page.evaluate(() => [...document.querySelectorAll('.v-list-subheader')]
        .filter(e => parseFloat(getComputedStyle(e).paddingInlineStart) < 16).map(e => e.innerText.trim()));
      if (flush.length) throw new Error(`subheaders without their indent: ${flush.join(', ')}`);
    });
  }
  await browser.close();
  finish();
  return process.exitCode;
}

main(async () => {
  const { creatureId } = await getTestUser();
  const extra = await withDb(async db => {
    const library = await db.collection('libraries').findOne({ public: true }, { projection: { _id: 1 } });
    const collection = await db.collection('libraryCollections').findOne({ public: true }, { projection: { _id: 1 } });
    return [library && `/library/${library._id}`, collection && `/library-collection/${collection._id}`].filter(Boolean);
  });
  const signedIn = [...SIGNED_IN, `/character/${creatureId}`, `/print-character/${creatureId}`,
    `/print-character/${creatureId}?layout=official`, `/print-cards/${creatureId}`, ...extra,
    ...(process.env.E2E_EXTRA_ROUTES ? process.env.E2E_EXTRA_ROUTES.split(',') : [])];
  const first = await checkRoutes('signed in', signedIn, true);
  const second = await checkRoutes('signed out', SIGNED_OUT, false);
  process.exitCode = first || second ? 1 : 0;
});
