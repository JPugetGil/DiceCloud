import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';

/*
 * The webhooks' tokens at rest (secretCipher.ts, pastedWebhooks.ts): sealed
 * and opened again, an altered value refused, the startup job that seals what
 * is stored (plaintext, or with an old key) and fills the pasted webhooks'
 * ids in, as many times as it runs; without a key, plaintext as before.
 */

if (Meteor.isServer) describe('Discord webhooks\' tokens at rest (secretCipher)', function () {
  this.timeout(20000);
  /* eslint-disable @typescript-eslint/no-require-imports */
  const cipher = require('/imports/api/discord/server/secretCipher');
  const { sealStoredSecrets, pastedWebhook, pastedWebhookFields } = require('/imports/api/creature/log/server/pastedWebhooks');
  const { ConnectedWebhooks } = require('/imports/api/creature/log/server/connectedWebhooks');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const KEY = Buffer.alloc(32, 1).toString('base64');
  const OLD_KEY = Buffer.alloc(32, 2).toString('base64');
  const OTHER_KEY = Buffer.alloc(32, 3).toString('base64');
  const url = (id: string, token: string) => `https://discord.com/api/webhooks/${id}/${token}`;
  let restoreKeys: () => void = () => {};

  afterEach(function () {
    restoreKeys();
  });

  describe('sealing', function () {
    it('opens what it sealed; each seal differs; the format says its version and key', function () {
      restoreKeys = cipher.setTokenKeys(KEY);
      const plain = url('123', 'a-token_with-every-char');
      const first = cipher.sealSecret(plain);
      const second = cipher.sealSecret(plain);
      assert.match(first, /^enc1\.[0-9a-f]{8}\.[\w-]{16}\.[\w-]+\.[\w-]{22}$/);
      assert.notEqual(first, second, 'a new IV each time');
      assert.notInclude(first, 'a-token');
      assert.equal(cipher.openSecret(first), plain);
      assert.equal(cipher.openSecret(second), plain);
      assert.isTrue(cipher.isSealed(first));
      assert.equal(cipher.openSecret(plain), plain, 'a plaintext value reads as it is');
      assert.equal(cipher.openSecret(cipher.sealSecret('')), '');
    });

    it('refuses an altered value: ciphertext, tag, IV, key id, or a shortened tag', function () {
      restoreKeys = cipher.setTokenKeys(KEY);
      const sealed: string = cipher.sealSecret(url('123', 'token'));
      const [format, keyId, iv, ciphertext, tag] = sealed.split('.');
      const flip = (text: string, at = 0) => text.slice(0, at) + (text[at] === 'A' ? 'B' : 'A') + text.slice(at + 1);
      const altered = [
        [format, keyId, iv, flip(ciphertext, 5), tag],
        [format, keyId, iv, ciphertext, flip(tag, 3)],
        [format, keyId, flip(iv, 2), ciphertext, tag],
        [format, keyId, iv, ciphertext, tag.slice(0, 6)],
        [format, '00000000', iv, ciphertext, tag],
        [format, keyId, iv, ciphertext],
      ].map(parts => parts.join('.'));
      for (const value of altered) {
        assert.throws(() => cipher.openSecret(value), cipher.SecretError, undefined, value);
      }
      // Under another key, the same value does not open
      restoreKeys();
      restoreKeys = cipher.setTokenKeys(OTHER_KEY);
      assert.throws(() => cipher.openSecret(sealed), cipher.SecretError, /lack/);
    });

    it('without a key: stored as it is, a sealed value unreadable, one warning per reason', function () {
      restoreKeys = cipher.setTokenKeys(KEY);
      const sealed = cipher.sealSecret('a secret');
      restoreKeys();
      restoreKeys = cipher.setTokenKeys(undefined);
      assert.deepEqual(cipher.tokenKeyStatus(), { sealing: false, keyId: undefined, problems: [] });
      assert.equal(cipher.sealSecret('a secret'), 'a secret');
      assert.throws(() => cipher.openSecret(sealed), cipher.SecretError);
      const warn = console.warn;
      const warnings: string[] = [];
      console.warn = (message: string) => warnings.push(message);
      try {
        assert.isUndefined(cipher.openSecretOrWarn(sealed, 'a test value'));
        assert.isUndefined(cipher.openSecretOrWarn(sealed, 'a test value'));
      } finally {
        console.warn = warn;
      }
      assert.lengthOf(warnings, 1);
      assert.notInclude(warnings[0], sealed);
      // A key that is not 32 bytes is no key
      restoreKeys();
      restoreKeys = cipher.setTokenKeys('dG9vIHNob3J0');
      assert.isFalse(cipher.tokenKeyStatus().sealing);
      assert.match(cipher.tokenKeyStatus().problems[0], /32 bytes/);
    });

    it('stores a pasted URL sealed, with its webhook\'s id, and reads it back', function () {
      restoreKeys = cipher.setTokenKeys(KEY);
      const fields = pastedWebhookFields(url('4242', 'pasted-token'));
      assert.equal(fields.webhookId, '4242');
      assert.match(fields.stored, /^enc1\./);
      assert.deepEqual(pastedWebhook(fields.stored), { id: '4242', token: 'pasted-token' });
      assert.deepEqual(pastedWebhook(url('4242', 'pasted-token')), { id: '4242', token: 'pasted-token' }, 'plaintext too');
      assert.isUndefined(pastedWebhookFields('not a webhook'));
    });
  });

  describe('the startup job (sealStoredSecrets)', function () {
    const creatureIds = [Random.id(), Random.id(), Random.id(), Random.id()];
    const folderIds = [Random.id(), Random.id()];
    const webhookIds = ['1700000000000000001', '1700000000000000002', '1700000000000000003'];

    afterEach(async function () {
      await Promise.all([
        Creatures.removeAsync({ _id: { $in: creatureIds } }),
        ...folderIds.map(id => CreatureFolders.removeAsync(id)),
        ConnectedWebhooks.removeAsync({ webhookId: { $in: webhookIds as any[] } }),
      ]);
    });

    // Values sealed with a key, the keys put back
    function sealWith(key: string, ...values: string[]): string[] {
      const restore = cipher.setTokenKeys(key);
      try {
        return values.map(value => cipher.sealSecret(value));
      } finally {
        restore();
      }
    }

    // As stored, before the job: plaintext, sealed with the old key, sealed
    // with the current one; and a value sealed with a key nobody has
    async function storeMixed() {
      const [withOldKey, tokenWithOldKey] = sealWith(OLD_KEY, url('22', 'old-key-token'), 'connected-old');
      const [unreadable] = sealWith(OTHER_KEY, url('44', 'lost-key-token'));
      const [withKey, tokenWithKey, partyWithKey] = sealWith(KEY, url('33', 'current-token'), 'connected-current', url('66', 'party-sealed'));
      const connected = { guildId: 'g', createdAt: new Date() };
      await ConnectedWebhooks.rawCollection().insertMany([
        { _id: webhookIds[0], webhookId: webhookIds[0], token: 'connected-plain', ...connected, channelId: 'c1' },
        { _id: webhookIds[1], webhookId: webhookIds[1], token: tokenWithOldKey, ...connected, channelId: 'c2' },
        { _id: webhookIds[2], webhookId: webhookIds[2], token: tokenWithKey, ...connected, channelId: 'c3' },
      ]);
      await Creatures.rawCollection().insertMany([
        { _id: creatureIds[0], name: 'Plain', settings: { discordWebhook: url('11', 'plain-token'), hideSpellsTab: true } },
        { _id: creatureIds[1], name: 'Old key', settings: { discordWebhook: withOldKey }, discordWebhookId: '22' },
        { _id: creatureIds[2], name: 'Current key', settings: { discordWebhook: withKey }, discordWebhookId: '33' },
        { _id: creatureIds[3], name: 'Lost key', settings: { discordWebhook: unreadable }, discordWebhookId: '44' },
      ] as any[]);
      await CreatureFolders.rawCollection().insertMany([
        { _id: folderIds[0], name: 'Plain party', discord: { webhook: url('55', 'party-plain'), enabled: true } },
        { _id: folderIds[1], name: 'Sealed party', discord: { webhook: partyWithKey, webhookId: '66' } },
      ] as any[]);
      return { withKey, unreadable };
    }

    const creature = (i: number) => Creatures.rawCollection().findOne({ _id: creatureIds[i] }) as Promise<any>;
    const folder = (i: number) => CreatureFolders.rawCollection().findOne({ _id: folderIds[i] }) as Promise<any>;
    const connectedTokens = () => ConnectedWebhooks.rawCollection().find({ webhookId: { $in: webhookIds } }).sort({ _id: 1 }).toArray();

    /**
     * The job, once over whatever the other suites left in the test database
     * (its counts then theirs alone), then over these documents: the counts
     * of these documents
     */
    async function jobOverMixed() {
      const baseline = await sealStoredSecrets();
      const stored = await storeMixed();
      const ours = (run: any) => Object.fromEntries(Object.entries(run).map(([part, counts]: [string, any]) => [
        part, { ...counts, unreadable: counts.unreadable - baseline[part].unreadable },
      ]));
      return { stored, run: async () => ours(await sealStoredSecrets()) };
    }

    it('seals plaintext and old-key values with the current key, fills the ids in, and finds nothing to do the second time', async function () {
      restoreKeys = cipher.setTokenKeys(KEY, [OLD_KEY]);
      const { stored: { withKey, unreadable }, run } = await jobOverMixed();
      const first = await run();
      assert.deepEqual(first.connected, { sealed: 2, ids: 0, unreadable: 0 });
      assert.deepEqual(first.creatures, { sealed: 2, ids: 1, unreadable: 1 });
      assert.deepEqual(first.folders, { sealed: 1, ids: 1, unreadable: 0 });
      const keyId = cipher.tokenKeyStatus().keyId;
      // Everything readable is sealed with the current key, and opens to what it was
      const tokens = await connectedTokens();
      assert.deepEqual(tokens.map((doc: any) => cipher.openSecret(doc.token)), ['connected-plain', 'connected-old', 'connected-current']);
      for (const doc of tokens) assert.isTrue(doc.token.startsWith(`enc1.${keyId}.`));
      assert.deepEqual(pastedWebhook((await creature(0)).settings.discordWebhook), { id: '11', token: 'plain-token' });
      assert.equal((await creature(0)).discordWebhookId, '11');
      assert.isTrue((await creature(0)).settings.hideSpellsTab, 'the other settings stay');
      assert.deepEqual(pastedWebhook((await creature(1)).settings.discordWebhook), { id: '22', token: 'old-key-token' });
      assert.isTrue((await creature(1)).settings.discordWebhook.startsWith(`enc1.${keyId}.`));
      assert.equal((await creature(2)).settings.discordWebhook, withKey, 'already sealed with the key: untouched');
      assert.equal((await creature(3)).settings.discordWebhook, unreadable, 'a key nobody has: left as it is');
      assert.deepEqual(pastedWebhook((await folder(0)).discord.webhook), { id: '55', token: 'party-plain' });
      assert.equal((await folder(0)).discord.webhookId, '55');
      assert.isTrue((await folder(0)).discord.enabled);
      const stored = JSON.stringify([await creature(0), await creature(1), await folder(0), tokens]);
      for (const secret of ['plain-token', 'old-key-token', 'party-plain', 'connected-plain', 'connected-old']) {
        assert.notInclude(stored, secret);
      }

      const before = JSON.stringify([await creature(0), await creature(1), await folder(0), await folder(1), tokens]);
      const second = await run();
      assert.deepEqual(second.connected, { sealed: 0, ids: 0, unreadable: 0 });
      assert.deepEqual(second.creatures, { sealed: 0, ids: 0, unreadable: 1 });
      assert.deepEqual(second.folders, { sealed: 0, ids: 0, unreadable: 0 });
      assert.equal(JSON.stringify([await creature(0), await creature(1), await folder(0), await folder(1), await connectedTokens()]), before);
    });

    it('without a key: plaintext stays, the ids are filled in, sealed values counted when unreadable', async function () {
      restoreKeys = cipher.setTokenKeys(undefined);
      const { run } = await jobOverMixed();
      const result = await run();
      assert.equal((await creature(0)).settings.discordWebhook, url('11', 'plain-token'), 'plaintext, as before');
      assert.equal((await creature(0)).discordWebhookId, '11');
      assert.equal((await folder(0)).discord.webhook, url('55', 'party-plain'));
      assert.equal((await folder(0)).discord.webhookId, '55');
      assert.equal((await connectedTokens())[0].token, 'connected-plain');
      assert.deepEqual(result.connected, { sealed: 0, ids: 0, unreadable: 2 });
      assert.deepEqual(result.creatures, { sealed: 0, ids: 1, unreadable: 3 });
      assert.deepEqual(result.folders, { sealed: 0, ids: 1, unreadable: 1 });
      // Pasted URLs still post: plaintext is read as it is
      assert.deepEqual(pastedWebhook((await creature(0)).settings.discordWebhook), { id: '11', token: 'plain-token' });
    });
  });
});
