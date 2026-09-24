/**
 * A Chromium page on the app, optionally signed in as the test account, with
 * every console error or warning and uncaught page error collected.
 */
const { chromium } = require('playwright');
const { BASE_URL, USERNAME, PASSWORD, assertSafeTarget } = require('./config');

// Keep messages comparable between runs: drop the host, cache busters and
// line:column positions
function normalize(text) {
  return text.split('\n')[0]
    .split(BASE_URL).join('')
    .replace(/\?v=[\w-]+|\?t=\d+|:\d+:\d+/g, '')
    .slice(0, 300);
}

async function openPage({ signedIn = true, colorScheme = 'dark', viewport = { width: 1400, height: 900 } } = {}) {
  assertSafeTarget();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, colorScheme });
  const page = await context.newPage();
  const messages = [];
  page.on('console', m => {
    if (['error', 'warning'].includes(m.type())) messages.push(`${m.type()}: ${normalize(m.text())}`);
  });
  page.on('pageerror', e => messages.push(`pageerror: ${normalize(e.message)}`));
  if (signedIn) {
    await signIn(page);
    messages.length = 0;
  }
  return { browser, context, page, messages };
}

async function signIn(page) {
  await page.goto(BASE_URL + '/sign-in', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.Meteor && window.Meteor.loginWithPassword, null, { timeout: 60000 });
  const error = await page.evaluate(({ username, password }) => new Promise(resolve => {
    window.Meteor.loginWithPassword(username, password, e => resolve(e ? (e.reason || e.message) : null));
  }), { username: USERNAME, password: PASSWORD });
  if (error) throw new Error(`Could not sign in as ${USERNAME}: ${error}. Run "npm run setup" first.`);
}

/** Navigate and give subscriptions and rendering time to settle */
async function visit(page, route, settleMs = 4000) {
  await page.goto(BASE_URL + route, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(settleMs);
}

/** Open a dialog through the app's dialog stack, as its callers do */
function pushDialog(page, component, data = {}) {
  return page.evaluate(({ component, data }) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
    pinia._s.get('dialogStack').pushDialogStack({ component, data });
  }, { component, data });
}

module.exports = { openPage, signIn, visit, pushDialog, BASE_URL };
