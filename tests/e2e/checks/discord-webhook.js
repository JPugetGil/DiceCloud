#!/usr/bin/env node
/**
 * A character's Discord webhook URL lets whoever has it post in the channel,
 * or delete the webhook: only those who may edit the character get it. The
 * test account gives its character a made-up webhook (its id is not a number,
 * so the server never sends anything to it), shares the character with the
 * other test account as a reader and makes it public. Then every DDP frame
 * the reader's browser receives on the sheet and the character list, those
 * of a signed-out visitor, and the REST API's answer without a token must not
 * hold the URL's token; the editor's frames must (else the search proves
 * nothing). Everything is put back at the end.
 */
const { openPage, visit, BASE_URL } = require('../lib/browser');
const { withDb, getTestUser } = require('../lib/db');
const { USERNAME } = require('../lib/config');
const { createChecker, main } = require('../lib/check');

const OTHER = `${USERNAME}-other`;
// The rate limit (5 calls in 5 s) refuses faster calls without a word
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Every DDP frame the page receives from now on */
function recordFrames(page) {
  const frames = [];
  page.on('websocket', socket => socket.on('framereceived', ({ payload }) => frames.push(String(payload))));
  return frames;
}

main(async () => {
  const { creatureId } = await getTestUser();
  const otherId = await withDb(async db => (await db.collection('users').findOne(
    { username: OTHER }, { projection: { _id: 1 } }))?._id);
  const token = `e2e-secret-${Date.now()}`;
  const webhookUrl = `https://discord.com/api/webhooks/e2e-not-a-webhook/${token}`;
  const docRef = { collection: 'creatures', id: creatureId };
  const { step, finish } = createChecker('Discord webhook: only editors get its URL');

  const editor = await openPage();
  const editorFrames = recordFrames(editor.page);
  await visit(editor.page, `/character/${creatureId}`, 5000);
  const call = async (name, args) => {
    const error = await editor.page.evaluate(({ name, args }) => window.Meteor.callAsync(name, args)
      .then(() => null, e => e.reason || e.message), { name, args });
    await pause(1200);
    if (error) throw new Error(`${name}: ${error}`);
  };

  const browsers = [editor.browser];
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
      return `${editorFrames.length} frames, the webhook among them`;
    });

    await step(`${OTHER}, a reader, never receives it`, null, async () => {
      const reader = await openPage({ username: OTHER });
      browsers.push(reader.browser);
      const frames = recordFrames(reader.page);
      await visit(reader.page, `/character/${creatureId}`, 6000);
      if (!frames.some(frame => frame.includes(creatureId) && frame.includes('settings'))) {
        throw new Error('the reader never received the character\'s settings: is the sheet open?');
      }
      await visit(reader.page, '/character-list', 3000);
      const leaks = frames.filter(frame => frame.includes(token));
      if (leaks.length) throw new Error(`${leaks.length} frame(s) hold the webhook`);
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
      if (frames.some(frame => frame.includes(token))) throw new Error('a frame holds the webhook');
      return `${frames.length} frames, none with the webhook`;
    });

    await step('the REST API without a token leaves it out', null, async () => {
      const response = await fetch(`${BASE_URL}/api/creature/${creatureId}`);
      const text = await response.text();
      if (response.status !== 200) throw new Error(`status ${response.status}: ${text.slice(0, 100)}`);
      if (!text.includes(creatureId)) throw new Error('the answer does not hold the character');
      if (text.includes(token)) throw new Error('the answer holds the webhook');
      return `${text.length} characters, without the webhook`;
    });
  } finally {
    // Put the character back as it was, whatever failed
    await step('the character is put back', editor.messages, async () => {
      await call('sharing.setPublic', { docRef, isPublic: false });
      if (otherId) await call('sharing.updateUserSharePermissions', { docRef, userId: otherId, role: 'none' });
      await call('creatures.update', { _id: creatureId, path: ['settings', 'discordWebhook'], value: null });
      const creature = await withDb(db => db.collection('creatures').findOne(
        { _id: creatureId }, { projection: { public: 1, readers: 1, settings: 1 } }));
      if (creature.public || creature.readers?.length || creature.settings?.discordWebhook) {
        throw new Error(`not put back: ${JSON.stringify(creature)}`);
      }
    });
    for (const browser of browsers) await browser.close();
  }
  finish();
});
