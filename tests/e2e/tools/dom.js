#!/usr/bin/env node
/**
 * Print the HTML of the first element matching a selector, after optional
 * clicks, signed in as the test account.
 *
 *   node tools/dom.js <route> <selector> [click selector]...
 *
 * `:character` in the route becomes the test account's character id.
 * MAX (characters to print, default 4000) and AFTER (ms to wait after each
 * click, default 2000) are read from the environment.
 */
const { openPage, visit } = require('../lib/browser');
const { getTestUser } = require('../lib/db');

(async () => {
  const [routeArg, selector, ...clicks] = process.argv.slice(2);
  if (!routeArg || !selector) throw new Error('usage: node tools/dom.js <route> <selector> [click selector]...');
  const route = routeArg.includes(':character') ? routeArg.replace(':character', (await getTestUser()).creatureId) : routeArg;
  const { browser, page, messages } = await openPage();
  await visit(page, route);
  for (const click of clicks) {
    await page.locator(click).first().click();
    await page.waitForTimeout(+(process.env.AFTER || 2000));
  }
  const html = await page.locator(selector).first().evaluate(el => el.outerHTML)
    .catch(e => `NOT FOUND: ${e.message.split('\n')[0]}`);
  console.log(html.replace(/ data-v-[a-z0-9]+=""/g, '').slice(0, +(process.env.MAX || 4000)));
  if (messages.length) console.log(`console:\n  ${[...new Set(messages)].join('\n  ')}`);
  await browser.close();
})().catch(e => {
  console.error(`dom failed: ${e.message.split('\n')[0]}`);
  process.exitCode = 1;
});
