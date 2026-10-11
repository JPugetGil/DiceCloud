#!/usr/bin/env node
/**
 * DiceCloud's Discord application (phase B), against the local fake of
 * Discord only, as a user clicks through it: "Connect to Discord" for the
 * test character and for a party board (Discord's page, the fake's, which
 * redirects at once), one webhook for the channel they share, a roll posted
 * with it; no client ever receives the webhook's token, its owner's browser
 * included, nor its sealed value; "Link my Discord account", whose token is
 * dropped, not revoked; the player mentioned on their turn; "Sign in with
 * Discord" for the linked account in one click (prompt=none), its ticket
 * useless in another browser, and a polite refusal for a Discord account
 * linked to none (prompt=none, then Discord's page). Then everything is
 * undone through the app.
 *
 * Needs a development server that posts to the fake and has an application
 * to connect with:
 *   DISCORD_WEBHOOK_TEST_API=http://127.0.0.1:3990/api/v10, and `discord`
 *   { clientId, clientSecret } in its settings (any values: the fake takes
 *   them). Otherwise the check says so and skips: nothing reaches Discord.
 */
const { openPage, visit, pushDialog } = require('../lib/browser');
const { withDb, getTestUser } = require('../lib/db');
const { createChecker, main } = require('../lib/check');
const { startFakeDiscord } = require('../lib/fakeDiscord');

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const PLAYER = { id: '1400000000000000042', username: 'e2e_player', global_name: 'E2E player' };
const STRANGER = { id: '1400000000000000099', username: 'nobody' };

/** Every DDP frame the page receives from now on */
function recordFrames(page) {
  const frames = [];
  page.on('websocket', socket => socket.on('framereceived', ({ payload }) => frames.push(String(payload))));
  return frames;
}

/** Calls a method as the page's user, through the app */
function caller(page) {
  return async (name, args) => {
    const result = await page.evaluate(({ name, args }) => window.Meteor.callAsync(name, args)
      .then(value => ({ value }), e => ({ error: e.reason || e.message })), { name, args });
    await pause(1200);
    if (result.error) throw new Error(`${name}: ${result.error}`);
    return result.value;
  };
}

async function waitFor(condition, what, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await condition();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await pause(250);
  }
}

const removeOverlay = page => page.evaluate(() => document.querySelector('#rspack-dev-server-client-overlay')?.remove());

main(async () => {
  const { userId, creatureId } = await getTestUser();
  const { step, finish } = createChecker('Discord\'s application: connect, link, sign in (against the fake)');
  const editor = await openPage();
  const frames = recordFrames(editor.page);
  await visit(editor.page, `/character/${creatureId}`, 5000);
  const call = caller(editor.page);

  let fake;
  try {
    fake = await startFakeDiscord();
    const ready = await editor.page.evaluate(async () => ({
      base: await window.Meteor.callAsync('discord.testApi').catch(() => null),
      oauth: !!window.Meteor.settings.public.discordOAuth,
    }));
    if (ready.base !== fake.baseUrl || !ready.oauth) {
      const posts = ready.base === fake.baseUrl;
      await fake.close();
      fake = undefined;
      await step('skipped: the server has no Discord application posting to the fake', null, async () => (
        `posts to the fake: ${posts ? 'yes' : 'no'}; application: ${ready.oauth ? 'yes' : 'no'} `
        + '(see the README: DISCORD_WEBHOOK_TEST_API and `discord` in the settings)'));
      await editor.browser.close();
      return finish();
    }
  } catch (e) {
    await editor.browser.close();
    throw e;
  }
  fake.authorizeAs({ user: PLAYER, guildId: '1500000000000000001', channelId: '1500000000000000002' });

  const browsers = [editor.browser];
  let folderId;
  try {
    await step('the test character connects to Discord through Discord\'s page, and back', editor.messages, async () => {
      await pushDialog(editor.page, 'creature-form-dialog', { _id: creatureId });
      await editor.page.getByRole('button', { name: 'Discord', exact: true }).click({ timeout: 15000 });
      await editor.page.click('[data-id="discord-connect-button"]');
      await editor.page.waitForURL(url => url.pathname === `/character/${creatureId}`, { timeout: 20000 });
      // The result is shown, then leaves the address
      await waitFor(() => !editor.page.url().includes('discord='), 'the address cleaned');
      const channel = await waitFor(() => withDb(async db => (await db.collection('creatures')
        .findOne({ _id: creatureId }, { projection: { discordChannel: 1 } }))?.discordChannel), 'the channel saved');
      const webhook = fake.oauthWebhooks.get(channel.webhookId);
      if (!webhook) throw new Error('the character points at a webhook the fake never made');
      return `channel ${channel.channelId}, webhook ${channel.webhookId}`;
    });

    await step('a roll posts with the connected webhook, under the character\'s name', editor.messages, async () => {
      await visit(editor.page, `/character/${creatureId}`, 3000);
      const channel = await withDb(async db => (await db.collection('creatures').findOne({ _id: creatureId })).discordChannel);
      const before = fake.requests.length;
      await call('creatureLogs.methods.logForCreature', { roll: '1d20', creatureId });
      const posted = await waitFor(() => fake.requests.slice(before)
        .find(request => request.method === 'POST' && request.webhookId === channel.webhookId), 'the roll posted');
      if (posted.status !== 204) throw new Error(`the fake answered ${posted.status} ${posted.code}`);
      return `posted as "${posted.body.username}"`;
    });

    await step('a party board connects to the same channel: one webhook for both', editor.messages, async () => {
      folderId = await call('creatureFolders.methods.insert', {});
      await call('creatureFolders.methods.updateName', { _id: folderId, name: 'E2E Discord OAuth' });
      await call('creatureFolders.methods.moveCreatureToFolder', { creatureId, folderId });
      await visit(editor.page, `/party/${folderId}`, 4000);
      await removeOverlay(editor.page);
      await editor.page.click('[data-id="party-discord"] [data-id="discord-connect-button"]');
      await editor.page.waitForURL(url => url.pathname === `/party/${folderId}`, { timeout: 20000 });
      const { creature, folder } = await waitFor(() => withDb(async db => {
        const folder = await db.collection('creatureFolders').findOne({ _id: folderId });
        const creature = await db.collection('creatures').findOne({ _id: creatureId });
        return folder?.discord?.channel && { creature, folder };
      }), 'the board connected');
      if (folder.discord.channel.webhookId !== creature.discordChannel.webhookId) throw new Error('two webhooks for one channel');
      const deleted = fake.requests.filter(request => request.method === 'DELETE');
      if (deleted.length !== 1) throw new Error(`${deleted.length} webhook(s) deleted, 1 expected`);
      await editor.page.waitForSelector('[data-id="party-discord"] [data-id="discord-connected"]', { timeout: 5000 });
      return 'the second webhook deleted, the board on the channel\'s webhook';
    });

    await step('no client ever receives a webhook\'s token, not even its owner; the server keeps it sealed', null, async () => {
      const tokens = [...fake.oauthWebhooks.values()].map(webhook => webhook.token);
      const leaks = frames.filter(frame => [...tokens, 'enc1.'].some(token => frame.includes(token)));
      if (leaks.length) throw new Error(`${leaks.length} frame(s) hold a webhook's token or a sealed value`);
      if (!frames.some(frame => frame.includes('discordChannel'))) throw new Error('the channel never reached its editor: the search proves nothing');
      const stored = await withDb(db => db.collection('discordWebhooks').find({ webhookId: { $in: [...fake.oauthWebhooks.keys()] } }).toArray());
      if (stored.some(doc => tokens.includes(doc.token)) && stored.some(doc => doc.token.startsWith('enc1.'))) {
        throw new Error('some tokens sealed, others not');
      }
      const at = stored.every(doc => doc.token.startsWith('enc1.')) ? 'sealed' : 'in plaintext (the server has no discord.tokenKey)';
      return `${frames.length} frames, no token; ${stored.length} token(s) stored ${at}`;
    });

    await step('the player links their Discord account in their account\'s settings', editor.messages, async () => {
      await visit(editor.page, '/account', 3000);
      await editor.page.click('[data-id="discord-link"]');
      await editor.page.waitForURL(url => url.pathname === '/account', { timeout: 20000 });
      await editor.page.waitForSelector('[data-id="discord-account-linked"]', { timeout: 10000 });
      const account = await withDb(async db => (await db.collection('users').findOne({ _id: userId })).discordAccount);
      if (account?.id !== PLAYER.id || Object.keys(account).sort().join() !== 'id,linkedAt,username') {
        throw new Error(`stored ${JSON.stringify(account)}`);
      }
      if (fake.requests.some(request => request.path === '/api/v10/oauth2/token/revoke')) throw new Error('a token revoked');
      if (![...fake.consents].some(consent => consent.endsWith(`|${PLAYER.id}|identify`))) throw new Error('the authorization is gone');
      const hint = (await editor.page.textContent('[data-id="discord-unlink-hint"]'))?.trim();
      if (!hint) throw new Error('no word of Discord\'s Authorized Apps');
      return `${(await editor.page.textContent('[data-id="discord-account-linked"]')).trim()}; token dropped, not revoked; "${hint}"`;
    });

    await step('the player is mentioned on their character\'s turn, on the party\'s channel', editor.messages, async () => {
      await visit(editor.page, `/party/${folderId}`, 4000);
      await removeOverlay(editor.page);
      const before = fake.requests.length;
      await editor.page.click('[data-id="initiative-roll"]');
      await editor.page.waitForSelector('[data-id="initiative-round"]', { timeout: 15000 });
      const line = await waitFor(() => fake.requests.slice(before)
        .find(request => request.method === 'POST' && /^Your turn: /.test(request.body?.content || '')), 'the turn line');
      await pause(1200);
      await editor.page.click('[data-id="initiative-end"]');
      await editor.page.waitForFunction(() => !document.querySelector('[data-id="initiative-round"]'), null, { timeout: 15000 });
      if (!line.body.content.includes(`<@${PLAYER.id}>`)) throw new Error(`"${line.body.content}"`);
      if (JSON.stringify(line.body.allowed_mentions) !== JSON.stringify({ parse: [], users: [PLAYER.id] })) {
        throw new Error(`allowed_mentions ${JSON.stringify(line.body.allowed_mentions)}`);
      }
      return line.body.content;
    });

    // The authorization pages of the fake since `from`, and their prompt
    const authorizations = from => fake.requests.slice(from)
      .filter(request => request.path === '/oauth2/authorize').map(request => request.query.prompt || 'page');

    await step('"Sign in with Discord" signs the linked account in, in one click', null, async () => {
      const visitor = await openPage({ signedIn: false });
      browsers.push(visitor.browser);
      await visit(visitor.page, '/sign-in', 3000);
      const from = fake.requests.length;
      await visitor.page.click('[data-id="discord-sign-in"]');
      await visitor.page.waitForURL(url => url.pathname === '/character-list', { timeout: 30000 });
      const signedIn = await waitFor(() => visitor.page.evaluate(() => window.Meteor.userId()), 'signed in');
      if (signedIn !== userId) throw new Error(`signed in as ${signedIn}`);
      if (visitor.messages.length) throw new Error(visitor.messages[0]);
      if (JSON.stringify(authorizations(from)) !== '["none"]') throw new Error(`Discord's pages: ${authorizations(from)}`);
      const left = await visitor.page.evaluate(() => localStorage.getItem('discordSignInNonce'));
      if (left) throw new Error('the nonce stays in the browser');
      if (visitor.page.url().includes('ticket')) throw new Error('the ticket stays in the address');
      return 'prompt=none, no page of Discord\'s; signed in, on the character list; nonce and ticket gone';
    });

    await step('a sign-in ticket sent to another browser signs nobody in (login CSRF)', null, async () => {
      // One browser starts the sign-in (its nonce in its storage); its way to
      // Discord is stopped, and the rest of the way, Discord and the
      // callback, gone through outside it: the ticket's address goes to
      // another browser. (A browser follows redirects without page.route
      // seeing them: only the first request can be stopped)
      const first = await openPage({ signedIn: false });
      browsers.push(first.browser);
      await visit(first.page, '/sign-in', 3000);
      let authorizeUrl;
      await first.page.route(url => url.pathname === '/oauth2/authorize', route => {
        authorizeUrl = route.request().url();
        // No content: the browser stays on the sign-in page
        return route.fulfill({ status: 204 });
      });
      await first.page.click('[data-id="discord-sign-in"]');
      await waitFor(() => authorizeUrl, 'Discord\'s address');
      if (!await first.page.evaluate(() => localStorage.getItem('discordSignInNonce'))) throw new Error('no nonce in the first browser');
      const callback = (await fetch(authorizeUrl, { redirect: 'manual' })).headers.get('location');
      const ticketUrl = (await fetch(callback, { redirect: 'manual' })).headers.get('location');
      if (!/[?&]ticket=/.test(ticketUrl || '')) throw new Error(`no ticket: ${ticketUrl}`);
      const other = await openPage({ signedIn: false });
      browsers.push(other.browser);
      await other.page.goto(ticketUrl);
      await other.page.waitForSelector('[data-id="discord-sign-in-message"]', { timeout: 20000 });
      const text = (await other.page.textContent('[data-id="discord-sign-in-message"]')).trim();
      if (await other.page.evaluate(() => window.Meteor.userId())) throw new Error('signed in with someone else\'s ticket');
      if (other.page.url().includes('ticket')) throw new Error('the ticket stays in the address');
      return `"${text}"`;
    });

    await step('a Discord account linked to none is told how to link it; no account is created', null, async () => {
      const users = await withDb(db => db.collection('users').countDocuments());
      fake.authorizeAs({ user: STRANGER, guildId: '1500000000000000001', channelId: '1500000000000000002' });
      const visitor = await openPage({ signedIn: false });
      browsers.push(visitor.browser);
      await visit(visitor.page, '/sign-in', 3000);
      const from = fake.requests.length;
      await visitor.page.click('[data-id="discord-sign-in"]');
      await visitor.page.waitForSelector('[data-id="discord-sign-in-message"]', { timeout: 20000 });
      const text = (await visitor.page.textContent('[data-id="discord-sign-in-message"]')).trim();
      if (await visitor.page.evaluate(() => window.Meteor.userId())) throw new Error('signed in');
      if (await withDb(db => db.collection('users').countDocuments()) !== users) throw new Error('an account was created');
      // Never authorized: prompt=none answered with an error, then Discord's page
      if (JSON.stringify(authorizations(from)) !== '["none","page"]') throw new Error(`Discord's pages: ${authorizations(from)}`);
      return `prompt=none, then Discord's page; "${text}"`;
    });
  } finally {
    await step('everything is undone: disconnected, unlinked, the board deleted', editor.messages, async () => {
      const errors = [];
      const attempt = async action => {
        try {
          await action();
        } catch (e) {
          errors.push(e.message);
        }
      };
      await attempt(() => call('discord.disconnect', { creatureId }));
      if (folderId) {
        await attempt(() => call('discord.disconnect', { folderId }));
        await attempt(() => call('creatureFolders.methods.remove', { _id: folderId }));
      }
      await attempt(() => call('discord.unlink', {}));
      const state = await withDb(async db => ({
        creature: (await db.collection('creatures').findOne({ _id: creatureId }, { projection: { discordChannel: 1 } })).discordChannel,
        account: (await db.collection('users').findOne({ _id: userId }, { projection: { discordAccount: 1 } })).discordAccount,
        // The fake's alone: the database may hold the developer's own, sealed with another key
        webhooks: await db.collection('discordWebhooks').countDocuments({ webhookId: { $in: [...fake.oauthWebhooks.keys()] } }),
        folder: folderId && await db.collection('creatureFolders').countDocuments({ _id: folderId }),
      }));
      if (state.creature || state.account || state.webhooks || state.folder) throw new Error(`left: ${JSON.stringify(state)}; ${errors.join('; ')}`);
      if (errors.length) throw new Error(errors.join('; '));
      const deleted = fake.requests.filter(request => request.method === 'DELETE').length;
      return `${deleted} webhook(s) deleted from the fake Discord`;
    });
    await fake.close();
    for (const browser of browsers) await browser.close().catch(() => {});
  }
  finish();
});
