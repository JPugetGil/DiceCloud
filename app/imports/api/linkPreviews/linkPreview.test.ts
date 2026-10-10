import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import {
  PREVIEW_LIMITS, characterPreview, hexColor, libraryPreview, previewHead, scriptJson, sitePreview, truncateBytes,
} from '/imports/api/linkPreviews/linkPreview';

const siteUrl = 'https://dicecloud.example/';
const url = 'https://dicecloud.example/character/abc123';
const bytes = (text: string) => new TextEncoder().encode(text).length;

// The component embed of a page's head, as Discord reads it
function componentEmbed(head: string) {
  const json = /<script id="discord:component-embed" type="application\/json" data-link-preview>(.*?)<\/script>/s.exec(head)?.[1];
  return json ? { json, embed: JSON.parse(json) } : undefined;
}
const meta = (head: string, key: string) => new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(head)?.[1];

const aria = {
  creature: { name: 'Aria', color: '#1976d2', picture: 'https://dicecloud.example/cdn/storage/userImages/x/original/x.png' },
  race: 'High Elf',
  classes: [{ name: 'Fighter', level: 3 }, { name: 'Wizard', level: 2 }],
  hitPoints: { value: 32, total: 45 },
  armorClass: 16,
  language: 'fr',
};

describe('Link previews (linkPreview)', function () {
  it('shows a public character: name, race, class and level, portrait, hit points and armor class', function () {
    const head = previewHead(characterPreview(aria, { siteUrl, url }));
    assert.equal(meta(head, 'og:title'), 'Aria');
    assert.equal(meta(head, 'og:description'), 'High Elf · Niveau 5 · Fighter 3, Wizard 2 — PV 32/45 · CA 16');
    assert.equal(meta(head, 'og:image'), aria.creature.picture);
    assert.equal(meta(head, 'og:site_name'), 'DiceCloud');
    assert.equal(meta(head, 'og:url'), url);
    assert.equal(meta(head, 'theme-color'), '#1976d2');
    assert.equal(meta(head, 'twitter:card'), 'summary');
    const { json, embed } = componentEmbed(head) || {};
    assert.isAtMost(bytes(json as string), PREVIEW_LIMITS.componentEmbedBytes);
    assert.deepEqual(embed, {
      type: 17,
      accent_color: 0x1976d2,
      components: [
        {
          type: 9,
          components: [{ type: 10, content: '### Aria\nHigh Elf · Niveau 5 · Fighter 3, Wizard 2\nPV 32/45 · CA 16' }],
          accessory: { type: 11, media: { url: aria.creature.picture } },
        },
        { type: 1, components: [{ type: 2, style: 5, label: 'Ouvrir la fiche', url }] },
      ],
    });
  });

  it('keeps within Discord\'s limits: title, description, component embed', function () {
    const long = characterPreview({
      ...aria, creature: { ...aria.creature, name: 'É'.repeat(128) }, race: 'R'.repeat(400),
    }, { siteUrl, url });
    assert.isAtMost(bytes(long.title), PREVIEW_LIMITS.titleBytes);
    assert.isTrue(long.title.endsWith('…'));
    assert.isAtMost(bytes(long.description), PREVIEW_LIMITS.descriptionBytes);
    assert.isAtMost(bytes(scriptJson(long.componentEmbed)), PREVIEW_LIMITS.componentEmbedBytes);
    assert.equal(truncateBytes('ab😀cd', 7), 'ab…', 'never half a character');
    assert.equal(hexColor('#A23'), '#aa2233');
    assert.isUndefined(hexColor('red'));
  });

  it('writes nothing a page could run: tags escaped, the JSON kept in its script', function () {
    const head = previewHead(characterPreview({
      creature: { name: '"><script>alert(1)</script>', color: 'javascript:1' },
    }, { siteUrl, url }));
    assert.notInclude(head, '<script>alert');
    assert.include(head, '&quot;&gt;&lt;script&gt;');
    assert.notInclude(componentEmbed(head)?.json, '</script>');
    assert.notInclude(head, 'theme-color', 'no colour but a real one');
  });

  it('shows DiceCloud alone for any other page, and a public library\'s name and description', function () {
    const site = previewHead(sitePreview({ siteUrl, language: 'en' }));
    assert.equal(meta(site, 'og:title'), 'DiceCloud');
    assert.equal(meta(site, 'og:url'), siteUrl);
    assert.equal(meta(site, 'og:image'), 'https://dicecloud.example/crown-dice-logo-cropped-transparent.png');
    assert.notInclude(site, 'component-embed');
    const library = previewHead(libraryPreview({ name: 'SRD 5.1', description: '## The **free** rules' }, { siteUrl, url, language: 'en' }));
    assert.equal(meta(library, 'og:title'), 'SRD 5.1');
    assert.equal(meta(library, 'og:description'), 'The free rules');
  });
});

if (Meteor.isServer) describe('The HTML of a character\'s page (server/linkPreviews)', function () {
  this.timeout(20000);
  /* eslint-disable @typescript-eslint/no-require-imports */
  const Creatures = require('/imports/api/creature/creatures/Creatures').default;
  const CreatureProperties = require('/imports/api/creature/creatureProperties/CreatureProperties').default;
  // Registers the boilerplate callback: unit tests load no entry point
  require('/imports/api/linkPreviews/server/linkPreviews');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const [publicId, privateId] = [Random.id(), Random.id()];

  before(async function () {
    await Creatures.rawCollection().insertMany([
      { _id: publicId, name: 'Aria the Bold', color: '#1976d2', public: true, type: 'pc', settings: {} },
      { _id: privateId, name: 'Secret Sam', color: '#ff0000', public: false, type: 'pc', settings: {} },
    ]);
    await CreatureProperties.rawCollection().insertMany([publicId, privateId].flatMap(id => [
      { _id: Random.id(), type: 'class', name: 'Rogue', level: 4, root: { id, collection: 'creatures' }, left: 1, right: 2 },
      {
        _id: Random.id(), type: 'attribute', attributeType: 'healthBar', variableName: 'hitPoints', name: 'Hit Points',
        value: 27, total: 31, root: { id, collection: 'creatures' }, left: 3, right: 4,
      },
    ]));
  });

  after(async function () {
    await Creatures.removeAsync({ _id: { $in: [publicId, privateId] } });
    await CreatureProperties.removeAsync({ 'root.id': { $in: [publicId, privateId] } });
  });

  const page = async (path: string) => {
    const response = await fetch(Meteor.absoluteUrl(path), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)' },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /^text\/html/);
    return response.text();
  };

  it('previews a public character', async function () {
    const html = await page(`character/${publicId}/aria-the-bold`);
    assert.equal(meta(html, 'og:title'), 'Aria the Bold');
    assert.include(meta(html, 'og:description'), 'Rogue');
    assert.include(meta(html, 'og:description'), '27/31');
    assert.equal(meta(html, 'og:url'), Meteor.absoluteUrl(`character/${publicId}`));
    const colours = [...html.matchAll(/<meta name="theme-color" content="([^"]*)"/g)].map(match => match[1]);
    assert.equal(colours.at(-1), '#1976d2', 'the last theme-color is the character\'s');
    assert.isDefined(componentEmbed(html));
    assert.include(html, '__meteor_runtime_config__', 'the app itself is there as ever');
  });

  it('shows nothing of a private character, nor of one that does not exist', async function () {
    for (const id of [privateId, Random.id()]) {
      const html = await page(`character/${id}`);
      assert.notInclude(html, 'Secret Sam');
      assert.notInclude(html, 'Rogue');
      assert.notInclude(html, '#ff0000');
      assert.notInclude(html, id, 'not even its address');
      assert.equal(meta(html, 'og:title'), 'DiceCloud');
      assert.isUndefined(componentEmbed(html));
    }
  });
});
