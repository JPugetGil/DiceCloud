#!/usr/bin/env node
/**
 * DiceCloud's slash commands and buttons on Discord (phase C), against the
 * local fake of Discord only, which sends the interactions to the server's
 * endpoint as Discord does, signed with its test key: the signature checked
 * (a wrong or old one refused); a Discord account linked to nobody told how
 * to link it; the test account links its Discord account (the fake's
 * authorization page), and chooses its
 * character with /character (by autocompletion), rolls with /roll, which
 * answers with the character's card and its reroll buttons, and the roll in
 * its log; "Reroll with advantage"; /check by autocompletion; /hp seen alone,
 * then changed and told; a roll in the channel of the character's pasted
 * webhook posted there once, by the reply; the commands registered on the
 * fake with a client credentials token; the Discord page's installation card.
 * And the bot (phase D): /connect, refused to a member who may not manage
 * webhooks, connects the character to a text channel through a webhook the
 * bot creates; "New session" > "New thread" in its form has the bot create
 * the thread, and a roll goes there; /connect in a forum's post connects the
 * forum, whose session is a post. Everything is put back.
 *
 * Needs a development server that posts to the fake, with a Discord
 * application and the fake's public key in its settings:
 *   DISCORD_WEBHOOK_TEST_API=http://127.0.0.1:3990/api/v10, and `discord`
 *   { clientId, clientSecret, publicKey: INTERACTIONS_PUBLIC_KEY of
 *   lib/fakeDiscord.js, botToken: "fake-bot-token" }. Otherwise the check
 *   says so and skips (the bot's steps alone, without the bot token):
 *   nothing reaches Discord.
 */
const { openPage, visit, pushDialog } = require('../lib/browser');
const { withDb, getTestUser } = require('../lib/db');
const { createChecker, main } = require('../lib/check');
const { startFakeDiscord, INTERACTIONS_PUBLIC_KEY } = require('../lib/fakeDiscord');
const { BASE_URL } = require('../lib/browser');

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const PLAYER = '1400000000000000242';
const STRANGER = '1400000000000000299';
const GUILD = '1500000000000000201';
const CHANNEL = '1500000000000000202';
const TEXT_ID = '1200000000000000201';
// The bot's server (phase D): a text channel, a forum and one of its posts
const BOT_TEXT = '1520000000000000201';
const BOT_FORUM = '1520000000000000202';
const BOT_POST = '1520000000000000203';
const MANAGE_WEBHOOKS = String((1n << 10n) | (1n << 29n));
const ORDINARY = String((1n << 10n) | (1n << 11n));
const BOT_PERMISSIONS = '309774517248';

async function waitFor(condition, what, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await condition();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await pause(200);
  }
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

main(async () => {
  const { userId, creatureId } = await getTestUser();
  const character = await withDb(db => db.collection('creatures').findOne({ _id: creatureId }, { projection: { name: 1 } }));
  const { step, finish } = createChecker('Discord\'s commands and buttons (against the fake)');
  const editor = await openPage();
  await visit(editor.page, `/character/${creatureId}`, 4000);
  const call = caller(editor.page);
  const endpoint = `${BASE_URL}/discord/interactions`;

  let fake;
  try {
    fake = await startFakeDiscord({
      botChannels: {
        [BOT_TEXT]: { type: 0, guildId: GUILD },
        [BOT_FORUM]: { type: 15, guildId: GUILD },
        [BOT_POST]: { type: 11, guildId: GUILD, parentId: BOT_FORUM },
      },
    });
    const ready = await editor.page.evaluate(async () => ({
      base: await window.Meteor.callAsync('discord.testApi').catch(() => null),
      interactions: !!window.Meteor.settings.public.discordInteractions,
    }));
    const ping = ready.base === fake.baseUrl && ready.interactions ? await fake.interact(endpoint, { type: 1 }) : undefined;
    if (ping?.answer?.type !== 1) {
      const posts = ready.base === fake.baseUrl;
      await fake.close();
      fake = undefined;
      await step('skipped: the server takes no interactions signed with the fake\'s key', null, async () => (
        `posts to the fake: ${posts ? 'yes' : 'no'}; interactions: ${ready.interactions ? 'yes' : 'no'}; `
        + `PING: ${ping ? ping.status : '–'} (discord.publicKey ${INTERACTIONS_PUBLIC_KEY.slice(0, 8)}…, see the README)`));
      await editor.browser.close();
      return finish();
    }
  } catch (e) {
    await editor.browser.close();
    throw e;
  }

  const where = (user = PLAYER, channel = CHANNEL) => ({
    application_id: '1600000000000000001', guild_id: GUILD, channel_id: channel, locale: 'en-US', member: { user: { id: user } },
  });
  // A user has 8 actions per 10 seconds: past them, the check waits as a user would
  const command = async (name, options = [], user, channel) => {
    const sent = await fake.interact(endpoint, { type: 2, ...where(user, channel), data: { name, options } });
    if (!/Too many/.test(sent.answer?.data?.content || '')) return sent;
    await pause(10500);
    return fake.interact(endpoint, { type: 2, ...where(user, channel), data: { name, options } });
  };
  const option = (name, value, type = 3) => ({ name, type, value });
  const edited = token => waitFor(() => fake.interactions.get(token)?.edits.at(-1), 'the reply');
  const customIds = message => [...JSON.stringify(message).matchAll(/"custom_id":"([^"]+)"/g)].map(match => match[1]);
  // The character's log entries since then (the log keeps its latest ones only)
  const loggedSince = since => withDb(db => db.collection('creatureLogs').find({ creatureId, date: { $gte: since } }).toArray());

  const browsers = [editor.browser];
  let linked = false;
  try {
    await step('the endpoint answers a signed PING, refuses a wrong or old signature', null, async () => {
      const tampered = await fake.interact(endpoint, { type: 1 }, { tamper: true });
      const old = await fake.interact(endpoint, { type: 1 }, { age: 600 });
      if (tampered.status !== 401 || old.status !== 401) throw new Error(`tampered ${tampered.status}, old ${old.status}`);
      return 'PONG; 401 and 401';
    });

    await step('a Discord account linked to no DiceCloud account is told how to link it', null, async () => {
      const { answer } = await command('roll', [option('formula', '1d20')], STRANGER);
      if (answer.type !== 4 || answer.data.flags !== 64) throw new Error(JSON.stringify(answer));
      if (!JSON.stringify(answer).includes(`${BASE_URL}/account`)) throw new Error('no link to the account page');
      return answer.data.content;
    });

    await step('the test account, linked, chooses its character by autocompletion', null, async () => {
      if (await withDb(db => db.collection('users').countDocuments({ 'discordAccount.id': PLAYER }))) {
        throw new Error('another account has the test Discord id');
      }
      // Linked through the app, as a user does (the fake's authorization page)
      fake.authorizeAs({ user: { id: PLAYER, username: 'e2e_interactions' } });
      await visit(editor.page, '/account', 3000);
      await editor.page.click('[data-id="discord-link"]');
      await editor.page.waitForURL(url => url.pathname === '/account', { timeout: 20000 });
      await editor.page.waitForSelector('[data-id="discord-account-linked"]', { timeout: 10000 });
      linked = true;
      const typed = (character.name || '').slice(0, 3);
      const choices = (await fake.interact(endpoint, {
        type: 4, ...where(), data: { name: 'character', options: [{ ...option('name', typed), focused: true }] },
      })).answer.data.choices;
      const choice = choices.find(item => item.value === creatureId);
      if (!choice) throw new Error(`choices ${JSON.stringify(choices)}`);
      const { answer } = await command('character', [option('name', choice.value)]);
      if (answer.data.flags !== 64 || !answer.data.content.includes(character.name)) throw new Error(JSON.stringify(answer));
      return `"${choice.name}" · ${answer.data.content}`;
    });

    let reroll;
    await step('/roll answers with the character\'s card and its reroll buttons; the roll is in its log', null, async () => {
      const since = new Date();
      const { answer, token } = await command('roll', [option('formula', '1d20 + 2')]);
      if (answer.type !== 5) throw new Error(`answered ${JSON.stringify(answer)}`);
      const reply = await edited(token);
      if (!(reply.flags & (1 << 15))) throw new Error('not a card');
      const text = JSON.stringify(reply);
      if (!text.includes(character.name) || !text.includes('Roll: 1d20 + 2')) throw new Error(text.slice(0, 300));
      [reroll] = customIds(reply);
      if (!/^dc:reroll:/.test(reroll || '')) throw new Error(`buttons ${customIds(reply)}`);
      const logged = await loggedSince(since);
      if (logged.length !== 1 || !JSON.stringify(logged[0].content).includes('1d20 + 2')) throw new Error(`logged ${JSON.stringify(logged).slice(0, 200)}`);
      return `${customIds(reply).length} buttons, in the log`;
    });

    await step('"Reroll with advantage" rolls it again, in a new message', null, async () => {
      const { answer, token } = await fake.interact(endpoint, {
        type: 3, ...where(), data: { custom_id: reroll, component_type: 2 }, message: { id: '1800000000000000201', flags: 1 << 15 },
      });
      if (answer.type !== 5) throw new Error(JSON.stringify(answer));
      const text = JSON.stringify(await edited(token));
      if (!text.includes('1d20 + 2 (Advantage)')) throw new Error(text.slice(0, 300));
      return 'with advantage';
    });

    await step('/check, by autocompletion: the sheet\'s check', null, async () => {
      const choices = (await fake.interact(endpoint, {
        type: 4, ...where(), data: { name: 'check', options: [{ ...option('skill', ''), focused: true }] },
      })).answer.data.choices;
      if (!choices.length) throw new Error('no check to choose');
      const { token } = await command('check', [option('skill', choices[0].value), option('secret', true, 5)]);
      if (!fake.interactions.get(token).answer?.data?.flags) throw new Error('secret, yet public');
      const text = JSON.stringify(await edited(token));
      return `${choices.length} choices; "${choices[0].name}" rolled, for the user alone (${text.length} characters)`;
    });

    await step('/hp: seen alone; a change goes through the engine and is told', null, async () => {
      const seen = (await command('hp')).answer;
      if (seen.data.flags !== 64) throw new Error(JSON.stringify(seen));
      if (/no hit points/.test(seen.data.content)) return `${seen.data.content} (nothing to change)`;
      const { answer, token } = await command('hp', [option('damage', 1, 4)]);
      if (answer.type !== 5 || answer.data?.flags) throw new Error(`answered ${JSON.stringify(answer)}`);
      const changed = (await edited(token)).content;
      const healed = (await edited((await command('hp', [option('healing', 1, 4)])).token)).content;
      return `${seen.data.content} · ${changed.split('\n').join(' / ')} · ${healed.split('\n').pop()}`;
    });

    await step('a roll in the channel of the character\'s pasted webhook is posted there once, by the reply', null, async () => {
      await call('creatures.discord.setWebhook', { creatureId, webhook: `https://discord.com/api/webhooks/${TEXT_ID}/e2e-interactions-token` });
      const channel = await waitFor(() => withDb(async db => (await db.collection('creatures')
        .findOne({ _id: creatureId }, { projection: { discordWebhookChannelId: 1 } }))?.discordWebhookChannelId), 'Discord asked where it posts');
      const posts = () => fake.requests.filter(request => request.method === 'POST' && request.webhookId === TEXT_ID).length;
      const here = await command('roll', [option('formula', '1d6')], PLAYER, channel);
      await edited(here.token);
      await pause(3000);
      if (posts()) throw new Error(`${posts()} post(s) in the reply's channel`);
      const elsewhere = await command('roll', [option('formula', '1d6')]);
      await edited(elsewhere.token);
      await waitFor(() => posts() === 1, 'the post in the webhook\'s own channel');
      return `channel ${channel}: the reply alone; elsewhere, the reply and the webhook's post`;
    });

    const bot = await editor.page.evaluate(() => !!window.Meteor.settings.public.discordBot);
    const connectCommand = (channel, member = MANAGE_WEBHOOKS) => fake.interact(endpoint, {
      type: 2, application_id: '1600000000000000001', guild_id: GUILD, channel_id: channel.id, channel, locale: 'en-US',
      member: { user: { id: PLAYER }, permissions: member }, app_permissions: BOT_PERMISSIONS,
      data: { name: 'connect', options: [option('target', `creature:${creatureId}`)] },
    });
    if (!bot) {
      await step('skipped: the server has no bot token (discord.botToken)', null, async () => 'the bot\'s steps need "botToken": "fake-bot-token"');
    } else {
      await step('/connect: a member without "Manage Webhooks" is refused; the bot\'s webhook connects the character', null, async () => {
        const refused = (await connectCommand({ id: BOT_TEXT, type: 0 }, ORDINARY)).answer;
        if (refused.data?.flags !== 64 || !/manage this channel's webhooks/.test(refused.data.content)) throw new Error(JSON.stringify(refused));
        const { answer, token } = await connectCommand({ id: BOT_TEXT, type: 0 });
        if (answer.type !== 5) throw new Error(JSON.stringify(answer));
        const reply = (await edited(token)).content;
        const channel = await waitFor(() => withDb(async db => (await db.collection('creatures')
          .findOne({ _id: creatureId }, { projection: { discordChannel: 1 } }))?.discordChannel), 'the character connected');
        if (channel.channelId !== BOT_TEXT || channel.kind !== 'text' || channel.webhookId !== fake.botWebhooks[0]?.id) {
          throw new Error(`channel ${JSON.stringify(channel)}`);
        }
        return `"${refused.data.content}" · "${reply}"`;
      });

      await step('"New session" > "New thread": the bot creates the thread, a roll goes into it', editor.messages, async () => {
        await visit(editor.page, `/character/${creatureId}`, 3000);
        await pushDialog(editor.page, 'creature-form-dialog', { _id: creatureId });
        await editor.page.getByRole('button', { name: 'Discord', exact: true }).click({ timeout: 15000 });
        await editor.page.click('[data-id="discord-session-start"]');
        await editor.page.click('[data-id="discord-session-newthread"]');
        const session = await waitFor(() => withDb(async db => (await db.collection('creatures')
          .findOne({ _id: creatureId }, { projection: { discordSession: 1 } }))?.discordSession), 'the session');
        const created = fake.requests.find(request => request.path === `/api/v10/channels/${BOT_TEXT}/threads`);
        if (session.kind !== 'thread' || created?.status !== 201 || created.body.type !== 11) throw new Error(`session ${JSON.stringify(session)}`);
        const posts = () => fake.requests.filter(request => request.method === 'POST' && request.webhookId === fake.botWebhooks[0].id);
        const before = posts().length;
        await call('creatureLogs.methods.logForCreature', { roll: '1d20', creatureId });
        const roll = await waitFor(() => posts().slice(before).find(request => request.status === 204), 'the roll');
        if (roll.query.thread_id !== session.threadId) throw new Error(`posted with thread_id ${roll.query.thread_id}`);
        await call('creatures.discord.endSession', { creatureId });
        await visit(editor.page, `/character/${creatureId}`, 2000);
        return `"${created.body.name}", the roll in it`;
      });

      await step('/connect in a forum\'s post connects the forum: its session is a post', null, async () => {
        const { token } = await connectCommand({ id: BOT_POST, type: 11, parent_id: BOT_FORUM });
        const reply = (await edited(token)).content;
        const channel = await waitFor(() => withDb(async db => {
          const found = (await db.collection('creatures').findOne({ _id: creatureId }, { projection: { discordChannel: 1 } }))?.discordChannel;
          return found?.channelId === BOT_FORUM && found;
        }), 'the forum connected');
        if (channel.kind !== 'forum') throw new Error(`channel ${JSON.stringify(channel)}`);
        const opened = await call('creatures.discord.startSession', { creatureId });
        if (opened?.kind !== 'forum') throw new Error(`session ${JSON.stringify(opened)}`);
        await call('creatures.discord.endSession', { creatureId });
        return `"${reply}" · a post: "${opened.name}"`;
      });
    }

    await step('the commands are registered on the fake with a client credentials token', null, async () => {
      const result = await call('discord.testRegisterCommands', {});
      const commands = [...fake.registeredCommands.values()][0] || [];
      const names = commands.map(command => `/${command.name} (${command.name_localizations?.fr})`).join(', ');
      if (result?.status !== 'registered' || commands.length !== 6) throw new Error(`${JSON.stringify(result)}; ${names}`);
      const token = fake.requests.find(request => request.path === '/api/v10/oauth2/token' && request.body?.grant_type === 'client_credentials');
      if (token?.body?.scope !== 'applications.commands.update') throw new Error(`scope ${token?.body?.scope}`);
      return names;
    });

    await step('the Discord page offers to install the application', editor.messages, async () => {
      await visit(editor.page, '/discord', 3000);
      if (bot) {
        // With the bot: a server's link asks for it and its four permissions; an account's has none
        const server = await editor.page.getAttribute('[data-id="discord-install-server"]', 'href');
        const account = await editor.page.getAttribute('[data-id="discord-install-account"]', 'href');
        if (!/client_id=\d+&scope=bot\+applications\.commands&permissions=309774517248&integration_type=0$/.test(server || '')) throw new Error(`server ${server}`);
        if (!/scope=applications\.commands&integration_type=1$/.test(account || '')) throw new Error(`account ${account}`);
        return `${server} · ${account}`;
      }
      const href = await editor.page.getAttribute('[data-id="discord-install-button"]', 'href');
      if (!/^https:\/\/discord\.com\/oauth2\/authorize\?client_id=\d+$/.test(href || '')) throw new Error(`href ${href}`);
      return href;
    });
  } finally {
    await step('everything is put back', editor.messages, async () => {
      const errors = [];
      const attempt = async action => {
        try {
          await action();
        } catch (e) {
          errors.push(e.message);
        }
      };
      await attempt(() => call('creatures.discord.setWebhook', { creatureId }));
      // The bot's connection: its webhooks deleted on the fake once nothing uses them
      await attempt(() => call('discord.disconnect', { creatureId }));
      // Unlinked through the app: the characters chosen go with it
      if (linked) await attempt(() => call('discord.unlink', {}));
      await attempt(() => withDb(db => db.collection('discordRerolls').deleteMany({ creatureId })));
      const left = await withDb(async db => ({
        account: (await db.collection('users').findOne({ _id: userId }, { projection: { discordAccount: 1 } }))?.discordAccount,
        webhook: (await db.collection('creatures').findOne({ _id: creatureId }, { projection: { discordWebhookId: 1 } }))?.discordWebhookId,
        channel: (await db.collection('creatures').findOne({ _id: creatureId }, { projection: { discordChannel: 1 } }))?.discordChannel,
        active: await db.collection('discordActiveCharacters').countDocuments({ discordUserId: PLAYER }),
      }));
      if (left.account || left.webhook || left.channel || left.active) throw new Error(`left: ${JSON.stringify(left)}; ${errors.join('; ')}`);
      if (errors.length) throw new Error(errors.join('; '));
    });
    await fake?.close();
    for (const browser of browsers) await browser.close().catch(() => {});
  }
  finish();
});
