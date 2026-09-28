#!/usr/bin/env node
/**
 * Screenshot a page, signed in as the test account unless --signed-out.
 *
 *   node tools/screenshot.js <route> <name> [--light] [--signed-out]
 *     [--width 1400] [--height 900] [--wait 4000] [--full]
 *     [--click "<selector>"]... [--element "<selector>"]
 *
 * `:character` in the route becomes the test account's character id. Writes
 * output/<name>.png and prints any console messages.
 */
const fs = require('fs');
const path = require('path');
const { openPage, visit } = require('../lib/browser');
const { getTestUser } = require('../lib/db');
const { OUTPUT_DIR } = require('../lib/config');

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : args[i + 1]; };
const flag = name => args.includes(`--${name}`);
const clicks = args.flatMap((a, i) => a === '--click' ? [args[i + 1]] : []);

(async () => {
  const [routeArg, name] = args;
  if (!routeArg || !name) throw new Error('usage: node tools/screenshot.js <route> <name> [options]');
  const route = routeArg.includes(':character') ? routeArg.replace(':character', (await getTestUser()).creatureId) : routeArg;
  const { browser, page, messages } = await openPage({
    signedIn: !flag('signed-out'),
    colorScheme: flag('light') ? 'light' : 'dark',
    viewport: { width: +option('width', 1400), height: +option('height', 900) },
  });
  await visit(page, route, +option('wait', 4000));
  for (const selector of clicks) {
    await page.locator(selector).first().click();
    await page.waitForTimeout(1500);
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const file = path.join(OUTPUT_DIR, `${name}.png`);
  const element = option('element');
  if (element) await page.locator(element).first().screenshot({ path: file });
  else await page.screenshot({ path: file, fullPage: flag('full') });
  console.log(file);
  if (messages.length) console.log(`console:\n  ${[...new Set(messages)].join('\n  ')}`);
  await browser.close();
})().catch(e => {
  console.error(`screenshot failed: ${e.message.split('\n')[0]}`);
  process.exitCode = 1;
});
