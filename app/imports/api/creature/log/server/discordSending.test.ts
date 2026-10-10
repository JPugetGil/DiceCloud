import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import {
  FALLBACK_USERNAME, createWebhookSender, discordUserAgent, postMessage,
} from '/imports/api/creature/log/server/webhookSender';
import { webhookUsername } from '/imports/api/creature/log/discord/discordMessages';
import { fakeDiscord, type FakeDiscord } from '/imports/api/creature/log/server/fakeDiscord.testFn';

/*
 * The fixes of phase A to how messages leave for Discord, against the local
 * fake (fakeDiscord.testFn.ts): the User-Agent Discord asks for, ?wait=true
 * and editing a message, ?with_components=true, a name Discord refuses, a
 * card Discord refuses, and a 404 that is not the webhook's.
 */

const webhook = { id: '1000000000000000101', token: 'tok-en_101' };
const card = {
  username: 'Aria',
  flags: 1 << 15,
  components: [{ type: 17, components: [{ type: 10, content: '### Longsword' }] }],
  allowed_mentions: { parse: [] },
};
const embeds = { username: 'Aria', embeds: [{ title: 'Longsword', fields: [] }], allowed_mentions: { parse: [] } };

if (Meteor.isServer) describe('Discord sending fixes (webhookSender)', function () {
  this.timeout(20000);
  let fake: FakeDiscord | undefined;
  afterEach(async function () {
    await fake?.close();
    fake = undefined;
  });

  it('identifies itself as Discord asks: DiscordBot (url, version)', async function () {
    fake = await fakeDiscord();
    const userAgent = discordUserAgent('https://dicecloud.example/', '1a2b3c4d');
    assert.equal(userAgent, 'DiscordBot (https://dicecloud.example/, 1a2b3c4d)');
    const sender = createWebhookSender({ baseUrl: fake.baseUrl, userAgent });
    sender.send(webhook, [embeds]);
    await sender.idle();
    assert.equal(fake.requests[0].userAgent, userAgent);
  });

  it('asks for the message with wait=true when its id is needed, then edits it in place', async function () {
    fake = await fakeDiscord();
    const sender = createWebhookSender({ baseUrl: fake.baseUrl });
    const results = await sender.enqueue(webhook, async request => {
      const posted = await postMessage(request, { body: embeds, wait: true });
      assert.isTrue(posted.ok);
      const id = posted.ok && posted.message?.id;
      const edited = await postMessage(request, { body: { ...embeds, embeds: [{ title: 'Edited', fields: [] }] }, messageId: id || '' });
      return { id, edited };
    });
    const [post, patch] = fake.requests;
    assert.equal(post.method, 'POST');
    assert.equal(post.query.wait, 'true');
    assert.equal(patch.method, 'PATCH');
    assert.equal(patch.path, `/api/v10/webhooks/${webhook.id}/${webhook.token}/messages/${results?.id}`);
    assert.notProperty(patch.query, 'wait', 'an edit always returns the message');
    assert.isTrue(results?.edited.ok);
    assert.equal((fake.messages.get(results?.id as string) as any)?.embeds[0].title, 'Edited');
  });

  it('asks for components with ?with_components=true, and only for a message that has some', async function () {
    fake = await fakeDiscord();
    const sender = createWebhookSender({ baseUrl: fake.baseUrl });
    sender.send(webhook, [card, embeds]);
    await sender.idle();
    assert.deepEqual(fake.requests.map(request => request.query.with_components), ['true', undefined]);
    assert.lengthOf(fake.messages, 2, 'Discord took both');
  });

  it('posts under DiceCloud\'s name when Discord refuses the character\'s, which it no longer does for "discord" or "clyde"', async function () {
    for (const name of ['Clyde', 'clyde bot', 'My Discord Bot', 'DISCORDIA', 'Thorgrim']) {
      const shown = webhookUsername(name) as string;
      assert.notMatch(shown, /discord|clyde/i, name);
      assert.equal(shown.replace(/\u200A/g, ''), name, 'the same letters, a hair space between two of them');
    }
    fake = await fakeDiscord();
    const sender = createWebhookSender({ baseUrl: fake.baseUrl });
    // A name Discord refuses all the same: the message goes, as DiceCloud
    sender.send(webhook, [{ ...embeds, username: 'Clyde' }]);
    sender.send(webhook, [{ ...embeds, username: webhookUsername('Clyde') }]);
    await sender.idle();
    assert.deepEqual(fake.requests.map(request => request.body.username), ['Clyde', FALLBACK_USERNAME, 'C lyde']);
    assert.lengthOf(fake.messages, 2);
  });

  it('sends the embeds when Discord refuses the card (50006)', async function () {
    fake = await fakeDiscord({
      override: (request, index) => index === 0
        ? { status: 400, headers: { 'Content-Type': 'application/json' }, body: { code: 50006, message: 'Cannot send an empty message' } }
        : undefined,
    });
    const sender = createWebhookSender({ baseUrl: fake.baseUrl });
    await sender.enqueue(webhook, request => postMessage(request, { body: card, fallback: [embeds] }));
    assert.lengthOf(fake.requests, 2);
    assert.property(fake.requests[0].body, 'components');
    assert.deepEqual(fake.requests[1].body, embeds);
  });

  it('keeps a webhook that answers 404 about a thread or a message, forgets one Discord no longer knows', async function () {
    fake = await fakeDiscord({ channels: { [webhook.id]: 'forum', '1000000000000000404': 'gone' } });
    const sender = createWebhookSender({ baseUrl: fake.baseUrl });
    const result = await sender.enqueue(webhook, request => postMessage(request, { body: embeds, threadId: '123' }));
    assert.isFalse(result?.ok);
    assert.equal(!result?.ok && result?.code, 10003);
    assert.isFalse(sender.isGone(webhook), 'Unknown Channel is the thread\'s');
    const gone = { id: '1000000000000000404', token: 'gone' };
    sender.send(gone, [embeds]);
    await sender.idle();
    assert.isTrue(sender.isGone(gone), 'Unknown Webhook');
  });
});
