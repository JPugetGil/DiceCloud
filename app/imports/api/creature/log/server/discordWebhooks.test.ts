import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureLogs, { insertCreatureLogWork } from '/imports/api/creature/log/CreatureLogs';
import {
  DISCORD_API, TEST_API_VARIABLE, createWebhookSender, discordApiBase, discordIntakeIdle, forgetWebhook,
  parseWebhookURL, setWebhookSender, type WebhookSender,
} from '/imports/api/creature/log/server/discordWebhooks';
import type { WebhookMessage } from '/imports/api/creature/log/discord/discordMessages';
import {
  createTestCreature, getRandomIds, runActionById,
} from '/imports/api/engine/action/functions/actionEngineTest.testFn';
import inputProvider from '/imports/api/engine/action/functions/userInput/inputProviderForTests.testFn';
import writeActionResults from '/imports/api/engine/action/functions/writeActionResults';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import { unloadAllCreatures } from '/imports/api/engine/loadCreatures';

type Reply = { status: number, headers?: Record<string, string>, body?: string, delayMs?: number };
type Received = { path: string, body: any, at: number };

/**
 * A local stand-in for Discord's webhook API: records each request and
 * answers as `reply` says. Never Discord itself.
 */
async function fakeDiscord(reply: (request: Received, index: number) => Reply) {
  // node:http only exists on the server: the client's test bundle drops it
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const http = Meteor.isServer ? require('node:http') : undefined;
  const requests: Received[] = [];
  const server = http.createServer((req: any, res: any) => {
    let data = '';
    req.on('data', (chunk: string) => data += chunk);
    req.on('end', () => {
      const request = { path: req.url, body: data ? JSON.parse(data) : undefined, at: Date.now() };
      const answer = reply(request, requests.length);
      requests.push(request);
      setTimeout(() => {
        res.writeHead(answer.status, answer.headers);
        res.end(answer.body ?? '');
      }, answer.delayMs || 0);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/api/v10`,
    requests,
    close: () => new Promise(resolve => {
      server.closeAllConnections();
      server.close(resolve);
    }),
  };
}

const NO_CONTENT: Reply = { status: 204 };
const webhook = { id: '1000000000000000001', token: 'tok-en_1' };
const message = (title: string): WebhookMessage => ({
  embeds: [{ title, fields: [] }], allowed_mentions: { parse: [] },
});
const titles = (requests: Received[]) => requests.map(request => request.body.embeds[0].title);

if (Meteor.isServer) describe('Discord webhooks (discordWebhooks)', function () {
  this.timeout(20000);
  let fake: Awaited<ReturnType<typeof fakeDiscord>> | undefined;
  afterEach(async function () {
    await fake?.close();
    fake = undefined;
  });

  it('reads a webhook from its URL', function () {
    assert.deepEqual(parseWebhookURL('https://discord.com/api/webhooks/123/abc-DEF_9'), { id: '123', token: 'abc-DEF_9' });
    assert.deepEqual(parseWebhookURL('https://discordapp.com/api/webhooks/123/abc?wait=true'), { id: '123', token: 'abc' });
    assert.deepEqual(parseWebhookURL('https://ptb.discord.com/api/v10/webhooks/123/abc/'), { id: '123', token: 'abc' });
    assert.isUndefined(parseWebhookURL('https://discord.com/api/webhooks/e2e/token'));
    assert.isUndefined(parseWebhookURL('https://discord.com/api/webhooks/123/to.ken'));
    assert.isUndefined(parseWebhookURL(''));
    assert.isUndefined(parseWebhookURL(undefined));
  });

  it('goes to Discord, or to a local fake in development and tests only', function () {
    const local = { [TEST_API_VARIABLE]: 'http://127.0.0.1:3990/api/v10/' };
    const production = { isDevelopment: false };
    assert.equal(discordApiBase(local, production), DISCORD_API, 'production never follows the variable');
    assert.equal(discordApiBase({}, production), DISCORD_API);
    assert.equal(discordApiBase(local, { isDevelopment: true }), 'http://127.0.0.1:3990/api/v10');
    assert.equal(discordApiBase({}, { isDevelopment: true }), DISCORD_API);
    for (const elsewhere of ['https://evil.example/api', 'http://10.0.0.2/api', 'file:///etc/passwd', 'not a url']) {
      assert.equal(discordApiBase({ [TEST_API_VARIABLE]: elsewhere }, { isDevelopment: true }), DISCORD_API, elsewhere);
    }
    assert.isUndefined(discordApiBase({}, { isTest: true }), 'a test without the fake reaches no one');
    assert.equal(discordApiBase(local, { isTest: true }), 'http://127.0.0.1:3990/api/v10');
  });

  it('posts each message once, in order, to the webhook only', async function () {
    fake = await fakeDiscord(() => ({ ...NO_CONTENT, delayMs: 20 }));
    const sender = createWebhookSender({ baseUrl: fake.baseUrl });
    sender.send(webhook, [message('A'), message('B')]);
    sender.send(webhook, [message('C')]);
    await sender.idle();
    assert.deepEqual(titles(fake.requests), ['A', 'B', 'C']);
    assert.isTrue(fake.requests.every(request => request.path === `/api/v10/webhooks/${webhook.id}/${webhook.token}`));
    assert.equal(sender.pending(webhook), 0);
  });

  it('waits when the rate limit headers say the bucket is empty', async function () {
    fake = await fakeDiscord((request, index) => index === 0
      ? { status: 204, headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset-After': '0.4' } }
      : NO_CONTENT);
    const sender = createWebhookSender({ baseUrl: fake.baseUrl });
    sender.send(webhook, [message('A'), message('B')]);
    await sender.idle();
    assert.deepEqual(titles(fake.requests), ['A', 'B']);
    assert.isAtLeast(fake.requests[1].at - fake.requests[0].at, 380);
  });

  it('sends a message refused with 429 again after the time asked, before the next one', async function () {
    fake = await fakeDiscord((request, index) => index === 0 ? {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '3', 'X-RateLimit-Reset-After': '3' },
      body: JSON.stringify({ message: 'You are being rate limited.', retry_after: 0.3, global: false }),
    } : NO_CONTENT);
    const sender = createWebhookSender({ baseUrl: fake.baseUrl });
    sender.send(webhook, [message('A'), message('B'), message('C')]);
    await sender.idle();
    assert.deepEqual(titles(fake.requests), ['A', 'A', 'B', 'C'], 'nothing lost, nothing overtaken');
    const waited = fake.requests[1].at - fake.requests[0].at;
    assert.isAtLeast(waited, 280, 'the body\'s retry_after');
    assert.isBelow(waited, 2500, 'the body\'s retry_after is the precise one');
  });

  it('reads Retry-After when a 429 has no JSON body', async function () {
    fake = await fakeDiscord((request, index) => index === 0
      ? { status: 429, headers: { 'Retry-After': '1' }, body: '<html>banned</html>' }
      : NO_CONTENT);
    const sender = createWebhookSender({ baseUrl: fake.baseUrl });
    sender.send(webhook, [message('A')]);
    await sender.idle();
    assert.deepEqual(titles(fake.requests), ['A', 'A']);
    assert.isAtLeast(fake.requests[1].at - fake.requests[0].at, 980);
  });

  it('drops a message Discord refuses (400) and goes on; retries a server error', async function () {
    fake = await fakeDiscord((request, index) => index === 0 ? { status: 400, body: '{"code":50035}' }
      : index === 1 ? { status: 502 } : NO_CONTENT);
    const sender = createWebhookSender({ baseUrl: fake.baseUrl });
    sender.send(webhook, [message('Bad'), message('B')]);
    await sender.idle();
    assert.deepEqual(titles(fake.requests), ['Bad', 'B', 'B']);
  });

  it('keeps a bounded queue per webhook', async function () {
    fake = await fakeDiscord(() => ({ ...NO_CONTENT, delayMs: 50 }));
    const sender = createWebhookSender({ baseUrl: fake.baseUrl, maxQueue: 3 });
    assert.isFalse(sender.send(webhook, ['A', 'B', 'C', 'D', 'E'].map(message)));
    const other = { id: '1000000000000000002', token: 'other' };
    assert.isTrue(sender.send(other, [message('Other')]), 'another webhook has its own queue');
    await sender.idle();
    assert.sameMembers(titles(fake.requests), ['A', 'B', 'C', 'Other']);
  });

  for (const status of [404, 401]) {
    it(`forgets a webhook that answers ${status}, on every character that has it`, async function () {
      fake = await fakeDiscord(() => ({
        status, headers: { 'Content-Type': 'application/json' },
        body: status === 404 ? '{"message": "Unknown Webhook", "code": 10015}' : '{"message": "Invalid Webhook Token", "code": 50027}',
      }));
      const dead = { id: '1000000000000000404', token: `dead-${status}` };
      const [first, second, unrelated] = getRandomIds(3);
      await Creatures.rawCollection().insertMany([
        { _id: first, name: 'First', settings: { discordWebhook: `https://discord.com/api/webhooks/${dead.id}/${dead.token}`, hideSpellsTab: true } },
        { _id: second, name: 'Second', settings: { discordWebhook: `https://discordapp.com/api/webhooks/${dead.id}/${dead.token}?wait=true` } },
        { _id: unrelated, name: 'Other', settings: { discordWebhook: `https://discord.com/api/webhooks/${dead.id}/${dead.token}-not` } },
      ] as any[]);
      try {
        const sender = createWebhookSender({ baseUrl: fake.baseUrl, onGone: forgetWebhook });
        sender.send(dead, [message('A'), message('B')]);
        await sender.idle();
        assert.deepEqual(titles(fake.requests), ['A'], 'nothing more is sent to it');
        assert.isTrue(sender.isGone(dead));
        assert.isFalse(sender.send(dead, [message('C')]));
        await sender.idle();
        assert.lengthOf(fake.requests, 1);
        const settings = async (_id: string) => (await Creatures.findOneAsync(_id))?.settings;
        assert.deepEqual(await settings(first), { hideSpellsTab: true });
        assert.deepEqual(await settings(second), {});
        assert.include((await settings(unrelated))?.discordWebhook, '-not', 'another token stays');
      } finally {
        await Creatures.removeAsync({ _id: { $in: [first, second, unrelated] } });
      }
    });
  }

  describe('of a character\'s log', function () {
    let sender: WebhookSender;
    let previous: WebhookSender | undefined;
    const [ownerId, creatureId, attackId, noteId] = getRandomIds(4);

    beforeEach(async function () {
      fake = await fakeDiscord(() => NO_CONTENT);
      sender = createWebhookSender({ baseUrl: fake.baseUrl, onGone: forgetWebhook });
      previous = setWebhookSender(sender);
      await Meteor.users.rawCollection().insertOne({
        _id: ownerId, createdAt: new Date(), preferences: { language: 'fr' },
      } as any);
    });

    afterEach(async function () {
      setWebhookSender(previous);
      await unloadAllCreatures();
      await Promise.all([
        Meteor.users.removeAsync(ownerId),
        Creatures.removeAsync(creatureId),
        CreatureProperties.removeAsync({ 'root.id': creatureId }),
        CreatureVariables.removeAsync({ _creatureId: creatureId }),
        CreatureLogs.removeAsync({ creatureId }),
      ]);
    });

    async function giveWebhook() {
      await Creatures.updateAsync(creatureId, {
        $set: {
          owner: ownerId, color: '#1976d2',
          'settings.discordWebhook': `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`,
        },
      });
    }

    async function sent() {
      await discordIntakeIdle();
      await sender.idle();
      return fake?.requests.map(request => request.body) ?? [];
    }

    it('posts a typed roll once, in the owner\'s language', async function () {
      await Creatures.rawCollection().insertOne({ _id: creatureId, name: 'Aria' } as any);
      await giveWebhook();
      await insertCreatureLogWork({
        log: { creatureId, content: [{ value: '1d20 + 5' }, { value: '1d20 [20] + 5' }, { value: '25' }] },
      });
      const [body, ...more] = await sent();
      assert.lengthOf(more, 0);
      assert.equal(body.username, 'Aria');
      assert.equal(body.embeds[0].title, 'Jet : 1d20 + 5');
      assert.equal(body.embeds[0].description, '**25**\n1d20 [20] + 5');
      assert.equal(body.embeds[0].url, Meteor.absoluteUrl(`character/${creatureId}`));
      assert.equal(body.embeds[0].color, 0x43A047, 'a natural 20');
      assert.deepEqual(body.allowed_mentions, { parse: [] });
    });

    it('posts an action of the engine once, without its hidden lines', async function () {
      await createTestCreature({
        _id: creatureId,
        name: 'Aria',
        props: [{
          _id: attackId, type: 'action', name: 'Longsword', attackRoll: { calculation: '5' },
          children: [
            { _id: noteId, type: 'note', name: 'GM secret', summary: { text: 'The blade is cursed' }, silent: true },
          ],
        }],
      });
      await giveWebhook();
      // Every die rolls its highest: a critical hit
      const action = await runActionById(attackId, [], {
        ...inputProvider,
        rollDice: async dice => dice.map(({ number, diceSize }) => new Array(number).fill(diceSize)),
      });
      await writeActionResults(action);
      const log = await CreatureLogs.findOneAsync({ creatureId });
      assert.isTrue(log?.content.some(line => line.silenced), 'the log keeps the hidden line');
      const bodies = await sent();
      assert.lengthOf(bodies, 1, 'one message for the one log entry');
      const [embed] = bodies[0].embeds;
      assert.equal(embed.title, 'Longsword');
      assert.equal(embed.color, 0x43A047);
      assert.deepEqual(embed.fields.map(field => field.name), ['Coup critique !']);
      assert.notInclude(JSON.stringify(bodies), 'cursed');
    });

    it('posts nothing for a character without a webhook', async function () {
      await Creatures.rawCollection().insertOne({ _id: creatureId, name: 'Aria', owner: ownerId, settings: {} } as any);
      await insertCreatureLogWork({ log: { creatureId, content: [{ name: 'Roll', value: '1d20 [3]' }] } });
      assert.deepEqual(await sent(), []);
    });
  });
});
