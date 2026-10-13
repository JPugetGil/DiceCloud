import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';

let markdownToHtml;
if (Meteor.isServer) {
  // It translates the dice's labels with the interface's i18n, which sets the
  // page's language as it loads: a page for that moment alone
  const page = /** @type {any} */ (globalThis);
  const pageless = !('document' in page);
  if (pageless) page.document = { documentElement: {} };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ({ default: markdownToHtml } = require('/imports/ui/utility/markdownToHtml'));
  } finally {
    if (pageless) delete page.document;
  }
}

/*
 * All the Markdown the app shows goes through markdownToHtml, before
 * DOMPurify: descriptions, the docs, the log. Upgrading marked broke it twice
 * without an error: text in angle brackets became tags, and the docs' links to
 * a section lost their target.
 */
describe('Markdown to HTML (markdownToHtml)', function () {
  before(function () {
    if (!Meteor.isServer) this.skip();
  });

  it('keeps escaped angle brackets as text, and typographic quotes and dashes out of code', function () {
    // As library texts write a placeholder: escaped, or as entities
    const html = markdownToHtml('Choose a \\<Placeholder\\> or &lt;Name&gt;, 3 < 4: "a" -- \'b\' --- c...\n\n`a -- "b"`');
    assert.include(html, '&lt;Placeholder&gt;');
    assert.include(html, '&lt;Name&gt;');
    assert.include(html, '3 &lt; 4');
    assert.notInclude(html, '<Placeholder>');
    assert.notInclude(html, '<Name>');
    assert.include(html, '“a” – ‘b’ — c…');
    assert.include(html, '<code class="v-code">a -- &quot;b&quot;</code>');
  });

  it('gives each block Vuetify\'s classes, and headings the id links point at', function () {
    const html = markdownToHtml([
      '## Ancestor references', '', 'A paragraph\nwith a break', '', '- one', '  - nested', '',
      '> quoted', '', '---', '', '| a | b |', '|---|---|', '| 1 | 2 |', '', '```', 'code', '```',
      '', '[a link](/docs/property/action)',
    ].join('\n'));
    assert.include(html, '<h2 class="text-headline-small mt-6 mb-3" id="ancestor-references">');
    assert.include(html, '<p class="mt-0 mb-4">A paragraph<br>with a break</p>');
    assert.include(html, '<ul class="mt-0 mb-4 ps-6">');
    assert.include(html, '<ul class="my-0 ps-6">', 'a nested list continues its item');
    assert.include(html, '<blockquote class="border-s-lg border-opacity-50 ps-4 mx-0 mt-0 mb-4">');
    assert.include(html, '<hr class="v-divider my-4">');
    assert.include(html, '<div class="v-table v-table--density-compact v-table--striped-odd mb-4"><div class="v-table__wrapper"><table>');
    assert.include(html, '<pre tabindex="0" class="v-code d-block px-3 py-2 mt-0 mb-4 overflow-x-auto">');
    assert.include(html, '<a class="text-primary" href="/docs/property/action">a link</a>');
  });

  it('draws the dice of the log\'s rolls, and only there', function () {
    const roll = '1d20 [ 20, ~~3~~ ] + 5';
    const html = markdownToHtml(roll, { dice: true });
    assert.include(html, '<span class="log-roll"><span class="text-medium-emphasis">1d20</span>');
    assert.match(html, /<span class="log-die log-die--d20 log-die--crit" style="--i: 0" title="[^"]+">20<\/span>/);
    assert.match(html, /<span class="log-die log-die--d20 log-die--dropped" style="--i: 1" title="[^"]+"><del>3<\/del><\/span>/);
    assert.notInclude(markdownToHtml(roll), 'log-roll', 'not in a description');
  });

  it('renders every default doc, whose links to a section find its heading', async function () {
    // any: the types know Meteor 2's Assets, without getTextAsync
    const docs = JSON.parse(await /** @type {any} */ (Assets).getTextAsync('docs/defaultDocs.json'));
    const rendered = new Map(docs.map(doc => [doc.href, markdownToHtml(doc.description || '')]));
    assert.isAbove(rendered.size, 40);
    const sectionLinks = [...rendered.values()].flatMap(html => [...html.matchAll(/href="(\/docs\/[^"#]+)#([^"]+)"/g)]);
    assert.isNotEmpty(sectionLinks, 'the docs link to sections');
    for (const [, href, id] of sectionLinks) {
      assert.include(rendered.get(href), ` id="${id}"`, `${href}#${id}`);
    }
  });
});
