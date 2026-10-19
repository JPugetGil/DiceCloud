#!/usr/bin/env node
/**
 * The account's own screens, through the UI. The Account page's preferences
 * (units, animations, theme, language, ability scores), each set and set
 * back, as the database records them; the username dialog, which refuses a
 * taken name and accepts a free one (never applied); the share dialog, which
 * finds another test account and not an unknown name (nothing shared); a
 * community library followed and unfollowed. Then an account of its own,
 * `<E2E_USERNAME>-deleted`, deleted through its dialog: gone, signed out, back
 * on the home page. The server signed the connection out only as it removed
 * the user, which closed the connection before the answer, and the call, sent
 * again signed out, failed with "No user" (2026-10-19).
 */
const { openPage, visit, pushDialog } = require('../lib/browser');
const { withDb, getTestUser } = require('../lib/db');
const { USERNAME, PASSWORD } = require('../lib/config');
const { createChecker, main } = require('../lib/check');

const user = username => withDb(db => db.collection('users').findOne({ username }, {
  projection: { preferences: 1, darkMode: 1, subscribedLibraries: 1, subscribedLibraryCollections: 1 },
}));
const settle = page => page.waitForTimeout(1500);

main(async () => {
  const { step, finish } = createChecker('The account\'s screens');
  const { browser, page, messages } = await openPage({ colorScheme: 'light' });
  try {
    await step('the Account page sets each preference and sets it back', messages, async () => {
      const before = await user(USERNAME);
      await visit(page, '/account');
      const pick = async (scope, name) => {
        await scope.locator('button', { hasText: name }).first().click();
        await settle(page);
        return (await user(USERNAME));
      };
      const item = id => page.locator(`[data-id="${id}"]`);
      const theme = page.locator('.theme-preference');
      const expect = (what, ok) => {
        if (!ok) throw new Error(what);
      };
      expect('feet not saved', (await pick(item('distance-unit-preference'), 'Feet')).preferences?.distanceUnit === 'ft');
      expect('metres not saved', (await pick(item('distance-unit-preference'), 'Metres')).preferences?.distanceUnit === 'm');
      expect('pounds not saved', (await pick(item('weight-unit-preference'), 'Pounds')).preferences?.weightUnit === 'lb');
      expect('kilograms not saved', (await pick(item('weight-unit-preference'), 'Kilograms')).preferences?.weightUnit === 'kg');
      expect('reduced animations not saved', (await pick(item('motion-preference'), 'Reduced')).preferences?.reduceMotion === true);
      // A preference set to false is unset (setPreference)
      expect('system animations not saved', !(await pick(item('motion-preference'), 'System')).preferences?.reduceMotion);
      expect('light theme not saved', (await pick(theme, 'Light')).darkMode === false);
      expect('dark theme not saved', (await pick(theme, 'Dark')).darkMode === true);
      const previousTheme = before.darkMode === true ? 'Dark' : before.darkMode === false ? 'Light' : 'Match device theme';
      expect('theme not set back', ((await pick(theme, previousTheme)).darkMode ?? null) === (before.darkMode ?? null));
      expect('French not saved', (await pick(item('language-preference'), 'Français')).preferences?.language === 'fr');
      expect('English not saved', (await pick(item('language-preference'), 'English')).preferences?.language === 'en');
      const swap = page.getByLabel('Swap ability scores and modifiers');
      const swapped = !!before.preferences?.swapAbilityScoresAndModifiers;
      await swap.click(); await settle(page);
      expect('ability scores swap not saved', !!(await user(USERNAME)).preferences?.swapAbilityScoresAndModifiers === !swapped);
      await swap.click(); await settle(page);
      expect('ability scores swap not set back', !!(await user(USERNAME)).preferences?.swapAbilityScoresAndModifiers === swapped);
      return `theme back to "${previousTheme}"`;
    });

    await step('the username dialog refuses a taken name, accepts a free one (not applied)', messages, async () => {
      await visit(page, '/account');
      await page.getByRole('button', { name: 'Change username' }).click();
      await page.waitForTimeout(1000);
      const dialog = page.locator('.dialog-stack');
      const field = dialog.getByLabel('Username');
      await field.fill(`${USERNAME}-other`);
      await page.waitForTimeout(2000);
      if (!await dialog.getByText('Username is already taken').isVisible()) throw new Error('a taken name was not refused');
      await field.fill(`${USERNAME}-free-name`);
      await page.waitForTimeout(2000);
      if (!await dialog.getByRole('button', { name: 'Update' }).isEnabled()) throw new Error('a free name was refused');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
    });

    await step('the share dialog finds another test account, not an unknown name (nothing shared)', messages, async () => {
      const { creatureId } = await getTestUser();
      await visit(page, `/character/${creatureId}`);
      await pushDialog(page, 'share-dialog', { docRef: { collection: 'creatures', id: creatureId } });
      await page.waitForTimeout(1500);
      const dialog = page.locator('.dialog-stack');
      const field = dialog.getByLabel('Username or email');
      await field.fill(`${USERNAME}-other`);
      await page.waitForTimeout(2000);
      if (!await dialog.getByRole('button', { name: 'Share' }).isEnabled()) throw new Error(`${USERNAME}-other not found`);
      await field.fill('e2e-nobody-by-this-name');
      await page.waitForTimeout(2000);
      if (!await dialog.getByText('User not found').isVisible()) throw new Error('an unknown name was found');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
    });

    await step('a community library is followed and unfollowed', messages, async () => {
      await visit(page, '/community-libraries', 6000);
      const button = page.locator('[data-id^="community-subscribe-"]').first();
      if (!await button.count()) return 'skipped: no community library';
      const id = (await button.getAttribute('data-id')).replace('community-subscribe-', '');
      const followed = async () => {
        const u = await user(USERNAME);
        return [...u.subscribedLibraries || [], ...u.subscribedLibraryCollections || []].includes(id);
      };
      const before = await followed();
      await button.click(); await page.waitForTimeout(2000);
      if (await followed() === before) throw new Error(`${id} not ${before ? 'unfollowed' : 'followed'}`);
      await button.click(); await page.waitForTimeout(2000);
      if (await followed() !== before) throw new Error(`${id} not set back`);
      return id;
    });
  } finally {
    await browser.close();
  }

  const username = `${USERNAME}-deleted`;
  const deleted = await openPage({ signedIn: false, colorScheme: 'light' });
  try {
    await step(`${username}, made for it, deletes its account through the dialog: signed out, home page`, deleted.messages, async () => {
      const { page: own } = deleted;
      await visit(own, '/sign-in', 1000);
      await own.waitForFunction(() => window.Accounts && window.Meteor, null, { timeout: 60000 });
      // Signed in to one a failed run left behind, else created
      const account = await own.evaluate(({ username, password }) => new Promise(resolve => {
        window.Meteor.loginWithPassword(username, password, loginError => {
          if (!loginError) return resolve('ok');
          // .invalid is reserved: nothing is ever delivered there
          window.Accounts.createUser({ username, email: `${username}@example.invalid`, password },
            e => resolve(e ? e.reason || e.message : 'ok'));
        });
      }), { username, password: PASSWORD });
      if (account !== 'ok') throw new Error(`no account: ${account}`);
      await visit(own, '/account');
      await own.locator('[data-id="delete-account-btn"]').click();
      await own.waitForTimeout(1500);
      const dialog = own.locator('.dialog-stack');
      await dialog.getByLabel('Type your username or email').fill(username);
      await dialog.getByLabel('To verify type \'delete my account\'').fill('delete my account');
      await dialog.getByRole('button', { name: 'Permanently delete account' }).click();
      await own.waitForTimeout(3000);
      if (await user(username)) throw new Error('the account is still there');
      const userId = await own.evaluate(() => window.Meteor.userId());
      if (userId) throw new Error(`still signed in as ${userId}`);
      const path = new URL(own.url()).pathname;
      if (path !== '/') throw new Error(`on ${path}, not the home page`);
      if (await own.locator('.dialog-stack .dialog').count()) throw new Error('the dialog stayed open');
    });
  } finally {
    await deleted.browser.close();
  }
  finish();
});
