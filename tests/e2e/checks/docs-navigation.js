#!/usr/bin/env node
/**
 * Navigates the default documentation inside the app (client-side routing), as
 * well as loading a page directly, signed in and signed out. Each page must show
 * its title and content: navigated pages once rendered an empty body.
 */
const { openPage, visit } = require('../lib/browser');
const { createChecker, main } = require('../lib/check');

async function assertDocShown(page, path) {
  await page.waitForTimeout(3500);
  const r = await page.evaluate(() => ({
    path: location.pathname,
    title: document.querySelector('.doc-viewer h1')?.innerText,
    notFound: [...document.querySelectorAll('h1')].some(h => h.innerText.includes('not found')),
    content: (document.querySelector('.doc-viewer .markdown')?.innerText || '').length
      + document.querySelectorAll('.doc-viewer .v-card').length,
  }));
  if (r.path !== path) throw new Error(`at ${r.path}, expected ${path}`);
  if (!r.title || r.notFound) throw new Error(`no document shown at ${path}`);
  if (!r.content) throw new Error(`${path} shows its title but no content`);
}

async function navigate(signedIn) {
  const { browser, page, messages } = await openPage({ signedIn });
  const { step, finish } = createChecker(`Docs navigation, ${signedIn ? 'signed in' : 'signed out'}`);
  await step('load /docs', messages, async () => { await visit(page, '/docs', 0); await assertDocShown(page, '/docs'); });
  await step('click the API card', messages, async () => {
    await page.locator('a[href="/docs/api"]').first().click();
    await assertDocShown(page, '/docs/api');
  });
  await step('click "Login to api"', messages, async () => {
    await page.locator('a[href="/docs/api/login"]').first().click();
    await assertDocShown(page, '/docs/api/login');
  });
  await step('click a sibling in the table of contents', messages, async () => {
    await page.locator('.sibling-list a[href="/docs/api/creature"]').first().click();
    await assertDocShown(page, '/docs/api/creature');
  });
  await step('load /docs/api/login directly', messages, async () => {
    await visit(page, '/docs/api/login', 0);
    await assertDocShown(page, '/docs/api/login');
  });
  await browser.close();
  finish();
  return process.exitCode;
}

main(async () => {
  const first = await navigate(true);
  const second = await navigate(false);
  process.exitCode = first || second ? 1 : 0;
});
