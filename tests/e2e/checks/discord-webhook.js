#!/usr/bin/env node
/**
 * Discord: who gets a webhook's URL and a session's ids, what a link to a
 * character shows, and what goes to Discord.
 *
 * Always. The test account gives its character a made-up webhook, shares the
 * character with the other test account as a reader and makes it public. Then
 * every DDP frame the reader's browser receives on the sheet and the
 * character list, those of a signed-out visitor, and the REST API's answer
 * without a token must not hold the URL's token; the editor's frames must
 * (else the search proves nothing). The HTML of the public character's page
 * holds its link preview; once private again, nothing of it.
 *
 * Against a local fake of Discord only. The check starts the fake on
 * 127.0.0.1:3990 (lib/fakeDiscord.js) and goes on only when the server says
 * it posts there: a dev server started with
 * DISCORD_WEBHOOK_TEST_API=http://127.0.0.1:3990/api/v10. Otherwise those
 * steps are skipped, and no webhook Discord could take is ever set: nothing
 * reaches Discord. The character's roll leaves as a card with Discord's
 * User-Agent; its "New session" in a text channel posts a header; the test
 * account makes a party board, which the other account joins, and pastes a
 * forum webhook on it; the player sees what the party posts, never where; a
 * roll goes to both channels; the board's "New session" opens a forum post;
 * a fight posts its start, the initiative message edited at each turn, the
 * turns and a summary, never a monster's hit points; each of the game
 * master's switches leaves its messages out. Everything is put back at the
 * end.
 */
const { openPage, visit, pushDialog, BASE_URL } = require('../lib/browser');
const { withDb, getTestUser } = require('../lib/db');
const { USERNAME } = require('../lib/config');
const { createChecker, main } = require('../lib/check');
const { startFakeDiscord } = require('../lib/fakeDiscord');

const OTHER = `${USERNAME}-other`;
// The rate limit (5 calls in 5 s) refuses faster calls without a word
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const DISCORDBOT = 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)';
const IS_COMPONENTS_V2 = 1 << 15;
// The webhooks of the fake: a text channel for the character, a forum for the party
const TEXT_ID = '1200000000000000001';
const FORUM_ID = '1200000000000000002';
const KINDS = ['initiative', 'turns', 'combat', 'rolls', 'sessions'];

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
      .then(value => ({ value }), e => ({ error: e.reason || e.message, code: e.error })), { name, args });
    await pause(1200);
    if (result.error) throw Object.assign(new Error(`${name}: ${result.error}`), { code: result.code });
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

// A page's preview, as Discord reads its HTML
async function preview(path) {
  const response = await fetch(`${BASE_URL}${path}`, { headers: { 'User-Agent': DISCORDBOT } });
  const html = await response.text();
  const meta = key => new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(html)?.[1];
  const embed = /<script id="discord:component-embed" type="application\/json" data-link-preview>(.*?)<\/script>/s.exec(html)?.[1];
  return { status: response.status, html, title: meta('og:title'), description: meta('og:description'), embed };
}

const removeOverlay = page => page.evaluate(() => document.querySelector('#rspack-dev-server-client-overlay')?.remove());

main(async () => {
  const { creatureId } = await getTestUser();
  const { otherId, character } = await withDb(async db => ({
    otherId: (await db.collection('users').findOne({ username: OTHER }, { projection: { _id: 1 } }))?._id,
    character: await db.collection('creatures').findOne({ _id: creatureId }, { projection: { name: 1 } }),
  }));
  const token = `e2e-secret-${Date.now()}`;
  const partyToken = `e2e-party-${Date.now()}`;
  const docRef = { collection: 'creatures', id: creatureId };
  const { step, finish } = createChecker('Discord: webhooks, sessions, link previews and what is posted');

  const editor = await openPage();
  const editorFrames = recordFrames(editor.page);
  await visit(editor.page, `/character/${creatureId}`, 5000);
  const call = caller(editor.page);

  // Against the fake only: the server must say it posts there
  let fake;
  try {
    fake = await startFakeDiscord({ channels: { [FORUM_ID]: 'forum' } });
    const base = await editor.page.evaluate(() => window.Meteor.callAsync('discord.testApi').catch(() => null));
    if (base !== fake.baseUrl) {
      await fake.close();
      fake = undefined;
    }
  } catch {
    fake = undefined;
  }
  // A webhook the server never calls (its id is not a number), or the fake's text channel
  const webhookUrl = `https://discord.com/api/webhooks/${fake ? TEXT_ID : 'e2e-not-a-webhook'}/${token}`;
  const partyWebhook = `https://discord.com/api/webhooks/${FORUM_ID}/${partyToken}`;
  // What only those who may see it can tell: the session's ids
  const secrets = [token, partyToken];
  let seen = 0;
  /** The fake's requests to a webhook since the last call */
  const sent = (webhookId) => {
    const fresh = fake.requests.slice(seen);
    seen = fake.requests.length;
    return webhookId ? fresh.filter(request => request.webhookId === webhookId) : fresh;
  };
  // The server posts after the method returns: wait for at least `count` new
  // requests, then until the fake has been quiet for a while
  const settle = async (count = 0) => {
    const end = Date.now() + 20000;
    let last = -1;
    while (fake.requests.length !== last || fake.requests.length - seen < count) {
      if (Date.now() > end) throw new Error(`${fake.requests.length - seen} request(s) to the fake, ${count} expected`);
      last = fake.requests.length;
      await pause(800);
    }
  };

  const browsers = [editor.browser];
  let folderId;
  let player;
  try {
    await step('the editor sets a webhook and shares the character with a reader, and the public', editor.messages, async () => {
      if (!otherId) throw new Error(`no ${OTHER} account: run "npm run setup"`);
      await call('creatures.update', { _id: creatureId, path: ['settings', 'discordWebhook'], value: webhookUrl });
      await call('sharing.updateUserSharePermissions', { docRef, userId: otherId, role: 'reader' });
      await call('sharing.setPublic', { docRef, isPublic: true });
      await pause(1500);
      if (!editorFrames.some(frame => frame.includes(token))) {
        throw new Error('the editor never received the webhook: the frame search would prove nothing');
      }
      return `${editorFrames.length} frames, the webhook among them; ${fake
        ? `the server posts to the fake Discord at ${fake.baseUrl}`
        : 'the server does not post to the fake Discord: the steps that post are skipped (see the README)'}`;
    });

    if (fake) {
      await step('the character\'s roll leaves as a card, with Discord\'s User-Agent', editor.messages, async () => {
        sent();
        await call('creatureLogs.methods.logForCreature', { roll: '1d20 + 2', creatureId });
        await settle(1);
        const [card, ...more] = sent(TEXT_ID);
        if (!card || more.length) throw new Error(`${more.length + !!card} message(s) to the character's channel`);
        if (!/^DiscordBot \(https?:\/\/[^,]+, .+\)$/.test(card.userAgent || '')) throw new Error(`User-Agent "${card.userAgent}"`);
        if (card.query.with_components !== 'true' || !(card.body.flags & IS_COMPONENTS_V2)) {
          throw new Error(`not a Components V2 card: ${JSON.stringify(card.query)} flags ${card.body.flags}`);
        }
        if (card.body.username !== character.name) throw new Error(`posted as "${card.body.username}"`);
        if (card.status !== 204) throw new Error(`the fake answered ${card.status} ${card.code}`);
        return `${card.userAgent}; ${JSON.stringify(card.body.components[0].components[0]).slice(0, 80)}…`;
      });

      await step('its "New session", in a text channel, posts a header message', editor.messages, async () => {
        await pushDialog(editor.page, 'creature-form-dialog', { _id: creatureId });
        // Its Discord section, a panel of the details' form ("Discord" in either language)
        await editor.page.getByRole('button', { name: 'Discord', exact: true }).click({ timeout: 15000 });
        await editor.page.waitForSelector('[data-id="discord-session-start"]', { timeout: 15000 });
        sent();
        await editor.page.click('[data-id="discord-session-start"]');
        const session = await waitFor(() => withDb(async db => (await db.collection('creatures')
          .findOne({ _id: creatureId }, { projection: { discordSession: 1 } }))?.discordSession), 'the session');
        const [refused, header] = sent(TEXT_ID);
        if (refused?.code !== 220003 || !header || header.body.thread_name || header.query.wait !== 'true') {
          throw new Error(`requests: ${JSON.stringify([refused, header].map(r => r && [r.status, r.code, r.body?.thread_name]))}`);
        }
        if (session.kind !== 'channel' || !session.messageId) throw new Error(`session ${JSON.stringify(session)}`);
        secrets.push(session.messageId);
        await editor.page.waitForSelector('[data-id="discord-session-end"]', { timeout: 5000 });
        const state = (await editor.page.textContent('[data-id="discord-session-state"]')).trim();
        await editor.page.keyboard.press('Escape');
        await pause(800);
        return `${header.body.content} · "${state}"`;
      });
    }

    await step(`${OTHER}, a reader, never receives the webhook${fake ? ' nor its session' : ''}`, null, async () => {
      const reader = await openPage({ username: OTHER });
      browsers.push(reader.browser);
      const frames = recordFrames(reader.page);
      await visit(reader.page, `/character/${creatureId}`, 6000);
      if (!frames.some(frame => frame.includes(creatureId) && frame.includes('settings'))) {
        throw new Error('the reader never received the character\'s settings: is the sheet open?');
      }
      await visit(reader.page, '/character-list', 3000);
      const leaks = frames.filter(frame => secrets.some(secret => frame.includes(secret)));
      if (leaks.length) throw new Error(`${leaks.length} frame(s) hold the webhook or the session`);
      await reader.browser.close();
      return `${frames.length} frames, none with the webhook`;
    });

    await step('a signed-out visitor of the public character never receives it', null, async () => {
      const visitor = await openPage({ signedIn: false });
      browsers.push(visitor.browser);
      const frames = recordFrames(visitor.page);
      await visit(visitor.page, `/character/${creatureId}`, 6000);
      if (!frames.some(frame => frame.includes(creatureId) && frame.includes('settings'))) {
        throw new Error('the visitor never received the character\'s settings');
      }
      if (frames.some(frame => secrets.some(secret => frame.includes(secret)))) throw new Error('a frame holds the webhook');
      await visitor.browser.close();
      return `${frames.length} frames, none with the webhook`;
    });

    await step('the REST API without a token leaves it out', null, async () => {
      const response = await fetch(`${BASE_URL}/api/creature/${creatureId}`);
      const text = await response.text();
      if (response.status !== 200) throw new Error(`status ${response.status}: ${text.slice(0, 100)}`);
      if (!text.includes(creatureId)) throw new Error('the answer does not hold the character');
      if (secrets.some(secret => text.includes(secret))) throw new Error('the answer holds the webhook or the session');
      return `${text.length} characters, without the webhook`;
    });

    await step('a link to the public character shows its preview to Discord', null, async () => {
      const page = await preview(`/character/${creatureId}`);
      if (page.status !== 200) throw new Error(`status ${page.status}`);
      if (page.title !== character.name) throw new Error(`og:title "${page.title}"`);
      if (!page.embed) throw new Error('no discord:component-embed');
      const size = Buffer.byteLength(page.embed);
      if (size > 3000) throw new Error(`a component embed of ${size} bytes`);
      if (secrets.some(secret => page.html.includes(secret))) throw new Error('the HTML holds the webhook');
      return `"${page.title}" · "${page.description}" · embed ${size} bytes`;
    });

    if (fake) {
      await step('the game master pastes a forum webhook on a party board; a player sees what it posts, never where', editor.messages, async () => {
        folderId = await call('creatureFolders.methods.insert', {});
        await call('creatureFolders.methods.updateName', { _id: folderId, name: 'E2E Discord party' });
        await call('creatureFolders.methods.moveCreatureToFolder', { creatureId, folderId });
        const invite = await call('creatureFolders.party.createInvite', { folderId });
        await visit(editor.page, `/party/${folderId}`, 4000);
        await removeOverlay(editor.page);
        await editor.page.fill('[data-id="party-discord-webhook"] input', partyWebhook);
        await editor.page.click('[data-id="party-discord-save"]');
        const saved = await waitFor(() => withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId }))?.discordPosting),
          'the webhook saved');
        if (JSON.stringify(saved) !== JSON.stringify({ rolls: true, combat: true })) throw new Error(`posting ${JSON.stringify(saved)}`);
        await editor.page.waitForSelector('[data-id="party-discord-enabled"]', { timeout: 5000 });

        player = await openPage({ username: OTHER });
        browsers.push(player.browser);
        const frames = recordFrames(player.page);
        await visit(player.page, `/party/join/${invite}`, 4000);
        const joinNotice = (await player.page.textContent('[data-id="party-join-discord"]'))?.trim();
        await caller(player.page)('creatureFolders.party.join', { token: invite, creatureIds: [] });
        await visit(player.page, `/party/${folderId}`, 5000);
        const notice = (await player.page.textContent('[data-id="party-discord-notice"]'))?.trim();
        if (!joinNotice || !notice) throw new Error('the player is not told the party posts to Discord');
        if (await player.page.$('[data-id="party-discord-webhook"]')) throw new Error('the player sees the webhook field');
        await visit(player.page, '/character-list', 2000);
        if (frames.some(frame => frame.includes(partyToken))) throw new Error('a frame of the player holds the party\'s webhook');
        if (player.messages.length) throw new Error(player.messages[0]);
        return `"${notice}"`;
      });

      await step('a roll goes to the character\'s channel and, in a post of its own, to the party\'s forum', editor.messages, async () => {
        sent();
        await call('creatureLogs.methods.logForCreature', { roll: '1d20', creatureId });
        await settle(4);
        const all = sent();
        const text = all.filter(request => request.webhookId === TEXT_ID);
        const forum = all.filter(request => request.webhookId === FORUM_ID);
        const steps = forum.map(request => request.code || (request.body.thread_name ? 'post' : request.query.thread_id ? 'in post' : request.status));
        if (text.length !== 1 || JSON.stringify(steps) !== JSON.stringify([220001, 'post', 'in post'])) {
          throw new Error(`character's channel ${text.length}, party's forum ${JSON.stringify(steps)}`);
        }
        return `forum: ${steps.join(' → ')} ("${forum[1].body.thread_name}")`;
      });

      await step('the board\'s "New session" opens another forum post', editor.messages, async () => {
        const before = fake.threads.size;
        await editor.page.click('[data-id="discord-session-start"]');
        await waitFor(() => fake.threads.size > before, 'a new post');
        await pause(1000);
        const state = (await editor.page.textContent('[data-id="discord-session-state"]')).trim();
        const session = await withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId }))?.discord?.session);
        if (session?.kind !== 'forum' || !fake.threads.has(session.threadId)) throw new Error(`session ${JSON.stringify(session)}`);
        sent();
        return `"${state}"`;
      });

      // A fight on the board: rolled, a turn on, ended
      const fight = async () => {
        await call('creatureFolders.initiative.add', { folderId, name: 'Ogre', bonus: 1, hp: 4321, ac: 13 });
        sent();
        await editor.page.click('[data-id="initiative-roll"]');
        await editor.page.waitForSelector('[data-id="initiative-round"]', { timeout: 15000 });
        await pause(1200);
        await editor.page.click('[data-id="initiative-next"]');
        await pause(1500);
        await editor.page.click('[data-id="initiative-end"]');
        await editor.page.waitForFunction(() => !document.querySelector('[data-id="initiative-round"]'), null, { timeout: 15000 });
        await pause(1200);
        await settle();
        const requests = sent(FORUM_ID);
        return {
          requests,
          start: requests.some(request => request.body?.content === '**Combat begins**'),
          initiative: requests.some(request => /^Combat — round/.test(request.body?.embeds?.[0]?.title || '') || request.method === 'PATCH'),
          turns: requests.filter(request => /^Your turn: |'s turn$/.test(request.body?.content || '')).length,
          summary: requests.some(request => /^End of combat/.test(request.body?.embeds?.[0]?.title || '')),
        };
      };

      await step('a fight posts the initiative message, which says it starts and is edited at each turn, the turns, a summary, and never a monster\'s hit points', editor.messages, async () => {
        const result = await fight();
        const patches = result.requests.filter(request => request.method === 'PATCH');
        const failed = result.requests.filter(request => request.status >= 400);
        // Two messages at the start: the initiative message, then the turn's line
        const first = result.requests.slice(0, 2).map(request => request.body?.embeds?.[0]?.title || request.body?.content);
        if (result.start || !/^Combat — round 1$/.test(first[0] || '') || !/^Your turn: |'s turn$/.test(first[1] || '')
          || !result.summary || result.turns !== 2 || patches.length !== 2 || failed.length) {
          throw new Error(`start line ${result.start}, first ${JSON.stringify(first)}, turns ${result.turns}, `
            + `edits ${patches.length}, summary ${result.summary}, refused ${failed.length}`);
        }
        if (result.requests.some(request => !request.query.thread_id)) throw new Error('a message outside the session\'s post');
        const all = JSON.stringify(result.requests.map(request => request.body));
        if (all.includes('4321') || /bloodied|unhurt|initiativeStats/.test(all)) throw new Error('a monster\'s hit points went to Discord');
        return `${result.requests.length} requests: ${patches.length} edits, ${result.turns} turn lines`;
      });

      // Each of the game master's switches, off then on again, through the board
      const toggle = async (kind, on) => {
        await editor.page.click(`[data-id="party-discord-publish-${kind}"] input`);
        await waitFor(() => withDb(async db => {
          const publish = (await db.collection('creatureFolders').findOne({ _id: folderId }))?.discord?.publish || {};
          return (publish[kind] !== false) === on;
        }), `${kind} ${on ? 'on' : 'off'}`);
        await pause(1200);
      };
      for (const kind of KINDS) {
        await step(`with "${kind}" turned off, the party's channel goes without it`, editor.messages, async () => {
          await toggle(kind, false);
          let detail;
          if (kind === 'rolls') {
            sent();
            await call('creatureLogs.methods.logForCreature', { roll: '1d20', creatureId });
            await settle(1);
            const all = sent();
            if (all.some(request => request.webhookId === FORUM_ID)) throw new Error('the roll went to the party');
            if (!all.some(request => request.webhookId === TEXT_ID)) throw new Error('the roll did not go to the character\'s channel');
            const posting = await withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId }))?.discordPosting);
            if (JSON.stringify(posting) !== JSON.stringify({ combat: true })) throw new Error(`the players are told ${JSON.stringify(posting)}`);
            detail = 'the character\'s channel only; the players are told the fights alone';
          } else if (kind === 'sessions') {
            await editor.page.waitForFunction(() => !document.querySelector('[data-id="discord-session-start"]'), null, { timeout: 5000 });
            sent();
            await call('creatureLogs.methods.logForCreature', { roll: '1d20', creatureId });
            await settle(2);
            const forum = sent(FORUM_ID);
            if (forum.some(request => request.body?.thread_name || request.query.thread_id)) throw new Error('a session was used');
            detail = `no "New session"; the forum refuses the roll outside a post (${forum.map(request => request.code).join(', ')})`;
          } else {
            const result = await fight();
            const shown = { initiative: result.initiative, turns: result.turns > 0, combat: result.start || result.summary };
            const others = Object.entries(shown).filter(([other]) => other !== kind);
            if (shown[kind] || others.some(([, on]) => !on)) throw new Error(`posted: ${JSON.stringify(shown)}`);
            // Without the initiative message, a line says the fight starts
            if (result.start !== (kind === 'initiative')) throw new Error(`a start line: ${result.start}`);
            detail = `posted: ${others.map(([other]) => other).join(', ')}`;
          }
          await toggle(kind, true);
          return detail;
        });
      }

      await step('with publishing off, nothing goes to the party, and the players are no longer told it does', editor.messages, async () => {
        await editor.page.click('[data-id="party-discord-enabled"] input');
        await waitFor(() => withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId }))?.discord?.enabled === false),
          'publishing off');
        await pause(1200);
        sent();
        await call('creatureLogs.methods.logForCreature', { roll: '1d20', creatureId });
        await settle(1);
        const rolled = sent(FORUM_ID).length;
        const result = await fight();
        const forum = rolled + result.requests.length;
        if (forum) throw new Error(`${forum} request(s) to the party's forum`);
        const posting = await withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId }))?.discordPosting);
        if (posting) throw new Error(`the players are told ${JSON.stringify(posting)}`);
        await visit(player.page, `/party/${folderId}`, 4000);
        if (await player.page.$('[data-id="party-discord"]')) throw new Error('the player still sees the notice');
        return 'nothing posted; no notice';
      });
    }
  } finally {
    // Put the character back as it was, whatever failed
    await step('the character and the board are put back', editor.messages, async () => {
      // Each whatever failed before it; the webhook first: a server started
      // without the fake would post to Discord itself
      const errors = [];
      const attempt = async (action) => {
        try {
          await action();
        } catch (e) {
          errors.push(e.message);
        }
      };
      await attempt(() => call('creatures.update', { _id: creatureId, path: ['settings', 'discordWebhook'], value: null }));
      if (fake) await attempt(() => call('creatures.discord.endSession', { creatureId }));
      if (folderId) {
        if (player) await attempt(() => caller(player.page)('creatureFolders.party.leave', { folderId }));
        await attempt(() => call('creatureFolders.methods.remove', { _id: folderId }));
      }
      await attempt(() => call('sharing.setPublic', { docRef, isPublic: false }));
      if (otherId) await attempt(() => call('sharing.updateUserSharePermissions', { docRef, userId: otherId, role: 'none' }));
      const creature = await withDb(db => db.collection('creatures').findOne(
        { _id: creatureId }, { projection: { public: 1, readers: 1, settings: 1, discordSession: 1 } }));
      const folder = folderId && await withDb(db => db.collection('creatureFolders').findOne({ _id: folderId }));
      if (creature.public || creature.readers?.length || creature.settings?.discordWebhook || creature.discordSession || folder) {
        throw new Error(`not put back: ${JSON.stringify({ creature, folder: !!folder })}; ${errors.join('; ')}`);
      }
      if (errors.length) throw new Error(errors.join('; '));
    });
    await fake?.close();
    for (const browser of browsers) await browser.close().catch(() => {});
  }

  await step('once private, a link to the character shows nothing of it', null, async () => {
    const page = await preview(`/character/${creatureId}`);
    if (page.html.includes(character.name) || page.embed || page.title !== 'DiceCloud') {
      throw new Error(`the preview reads "${page.title}"${page.embed ? ', with a component embed' : ''}`);
    }
    return `"${page.title}"`;
  });
  finish();
});
