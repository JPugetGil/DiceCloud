#!/usr/bin/env node
/**
 * The Google buttons (Sign In, Register, and "Link Google Account" on the
 * Account page) must show exactly when Google sign-in is configured on the
 * server, i.e. when the login service configuration collection has an entry.
 */
const { openPage, visit } = require('../lib/browser');
const { withDb } = require('../lib/db');
const { createChecker, main } = require('../lib/check');

main(async () => {
  const configured = await withDb(async db => !!await db.collection('meteor_accounts_loginServiceConfiguration')
    .findOne({ service: 'google' }, { projection: { _id: 1 } }));
  const expected = configured ? 1 : 0;
  const { step, finish } = createChecker(`Login services: Google is ${configured ? '' : 'not '}configured`);
  for (const signedIn of [false, true]) {
    const { browser, page, messages } = await openPage({ signedIn });
    for (const route of signedIn ? ['/account'] : ['/sign-in', '/register']) {
      await step(`${route}: ${expected} Google button`, messages, async () => {
        await visit(page, route);
        const count = await page.getByRole('button', { name: /google/i }).count();
        if (count !== expected) throw new Error(`found ${count}`);
      });
    }
    await browser.close();
  }
  finish();
});
