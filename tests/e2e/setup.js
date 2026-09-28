#!/usr/bin/env node
/**
 * Creates the test accounts and a character for each, through the app: an
 * account is registered the way the Register page does it, a character with the
 * app's own method. Safe to re-run: existing accounts and characters are kept.
 *
 * Two accounts: E2E_USERNAME, which the checks sign in as, and
 * `<E2E_USERNAME>-other`, whose character the `actions` check tries (and must
 * fail) to target, so no check ever points at a real account's data. The first
 * character also gets a "Hit Points" health bar (layout checks), a Strength
 * ability and an Athletics skill (the skill check dialog).
 */
const { openPage, BASE_URL } = require('./lib/browser');
const { withDb } = require('./lib/db');
const { USERNAME, PASSWORD } = require('./lib/config');

async function ensureAccount(page, username) {
  // Sign in, or create the account when that fails. Meteor answers a wrong
  // password and an unknown user with the same message, so both are tried.
  const account = await page.evaluate(({ username, password }) => new Promise(resolve => {
    window.Meteor.loginWithPassword(username, password, loginError => {
      if (!loginError) return resolve('signed in to the existing account');
      // .invalid is reserved: nothing is ever delivered there
      window.Accounts.createUser({ username, email: `${username}@example.invalid`, password }, createError => {
        if (!createError) return resolve('created');
        resolve(`error: sign-in failed (${loginError.reason || loginError.message}) and creating it failed `
          + `(${createError.reason || createError.message}); check E2E_PASSWORD`);
      });
    });
  }), { username, password: PASSWORD });
  if (account.startsWith('error')) throw new Error(`${username}: ${account}`);
  console.log(`account ${username}: ${account}`);
}

async function ensureCharacter(page) {
  const userId = await page.evaluate(() => window.Meteor.userId());
  const existing = await withDb(async db => (await db.collection('creatures').findOne(
    { owner: userId, removed: { $ne: true } }, { projection: { _id: 1 } }
  ))?._id);
  if (existing) {
    console.log(`  character: existing ${existing}`);
    return existing;
  }
  const created = await page.evaluate(() => window.Meteor.callAsync('creatures.insertCreature', {
    name: 'E2E character',
    startingLevel: 0,
  }));
  console.log(`  character: created ${created}`);
  return created;
}

// Properties the checks rely on, each added once
const PROPERTIES = [
  { type: 'attribute', attributeType: 'healthBar', name: 'Hit Points', variableName: 'hitPoints', baseValue: { calculation: '10' } },
  { type: 'attribute', attributeType: 'ability', name: 'Strength', variableName: 'strength', baseValue: { calculation: '10' } },
  { type: 'skill', skillType: 'skill', name: 'Athletics', variableName: 'athletics', ability: 'strength' },
];

async function ensureProperties(page, creatureId) {
  for (const creatureProperty of PROPERTIES) {
    const existing = await withDb(db => db.collection('creatureProperties').findOne({
      'root.id': creatureId, type: creatureProperty.type, variableName: creatureProperty.variableName, removed: { $ne: true },
    }, { projection: { _id: 1 } }));
    if (existing) {
      console.log(`  ${creatureProperty.name}: existing`);
      continue;
    }
    await page.evaluate(({ creatureId, creatureProperty }) => window.Meteor.callAsync('creatureProperties.insert', {
      creatureProperty,
      parentRef: { collection: 'creatures', id: creatureId },
    }), { creatureId, creatureProperty });
    console.log(`  ${creatureProperty.name}: created`);
  }
}

(async () => {
  const { browser, page } = await openPage({ signedIn: false });
  try {
    await page.goto(BASE_URL + '/sign-in', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.Meteor && window.Accounts, null, { timeout: 60000 });
    for (const username of [USERNAME, `${USERNAME}-other`]) {
      await ensureAccount(page, username);
      const creatureId = await ensureCharacter(page);
      if (username === USERNAME) await ensureProperties(page, creatureId);
      await page.evaluate(() => new Promise(resolve => window.Meteor.logout(resolve)));
    }
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(`setup failed: ${e.message.split('\n')[0]}`);
  process.exitCode = 1;
});
