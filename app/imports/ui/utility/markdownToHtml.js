import { Marked, Renderer } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';

/*
 * Rendered markdown takes Vuetify's own styles: the Material type scale for
 * headings, spacing and border utilities for blocks, and the classes of
 * VDivider, VTable and VCode. markdown.css keeps what classes cannot express.
 */
const HEADINGS = {
  1: 'text-headline-large',
  2: 'text-headline-small',
  3: 'text-title-large',
  4: 'text-title-medium',
  5: 'text-title-small',
  6: 'text-label-large',
};
const LIST = 'mt-0 mb-4 ps-6';

// Typographic dashes, quotes and ellipses: marked 4's `smartypants` option,
// removed in marked 8, applied as it was, to text before it is escaped (not to
// code, nor to raw HTML). The marked-smartypants extension leaves text
// unescaped instead: `<Placeholder>` in a description became a tag.
function smartypants(text) {
  return text
    .replace(/---/g, '\u2014')
    .replace(/--/g, '\u2013')
    .replace(/(^|[-\u2014/([{"\s])'/g, '$1\u2018')
    .replace(/'/g, '\u2019')
    .replace(/(^|[-\u2014/([{\u2018\s])"/g, '$1\u201C')
    .replace(/"/g, '\u201D')
    .replace(/\.{3}/g, '\u2026');
}
const typography = {
  walkTokens(token) {
    if (token.type === 'text' && !token.tokens && !token.escaped) {
      token.text = smartypants(token.text);
    }
  },
};
const base = Renderer.prototype;
// Adds classes to the element an html string starts with, if it is that tag
const addClass = (html, tag, classes) => html.replace(new RegExp(`^<${tag}\\b`), `<${tag} class="${classes}"`);

const marked = new Marked(
  { breaks: true, gfm: true, silent: true },
  typography,
  // Heading ids, which links to a section (`#ancestor-references`) point at
  gfmHeadingId(),
  {
    renderer: {
      paragraph(token) {
        return addClass(base.paragraph.call(this, token), 'p', 'mt-0 mb-4');
      },
      list(token) {
        return addClass(base.list.call(this, token), token.ordered ? 'ol' : 'ul', LIST);
      },
      // A list nested in an item continues the item: no space after it
      listitem(item) {
        return base.listitem.call(this, item).replaceAll(`class="${LIST}"`, 'class="my-0 ps-6"');
      },
      blockquote(token) {
        return addClass(base.blockquote.call(this, token), 'blockquote',
          'border-s-lg border-opacity-50 ps-4 mx-0 mt-0 mb-4');
      },
      hr(token) {
        return addClass(base.hr.call(this, token), 'hr', 'v-divider my-4');
      },
      table(token) {
        return '<div class="v-table v-table--density-compact v-table--striped-odd mb-4">'
          + `<div class="v-table__wrapper">${base.table.call(this, token)}</div></div>\n`;
      },
      codespan(token) {
        return addClass(base.codespan.call(this, token), 'code', 'v-code');
      },
      code(token) {
        return addClass(base.code.call(this, token), 'pre', 'v-code d-block px-3 py-2 mt-0 mb-4 overflow-x-auto');
      },
      link(token) {
        return addClass(base.link.call(this, token), 'a', 'text-primary');
      },
      image(token) {
        return addClass(base.image.call(this, token), 'img', 'my-2');
      },
    },
  },
);

// Headings keep the id gfmHeadingId gives them: a renderer extension cannot
// call the one it replaces, so its heading is wrapped here
const renderer = marked.defaults.renderer;
const headingWithId = renderer.heading;
renderer.heading = function (token) {
  return addClass(headingWithId.call(this, token), `h${token.depth}`, `${HEADINGS[token.depth]} mt-6 mb-3`);
};

/**
 * Markdown to HTML, unsanitized: sanitize it before putting it in the page.
 */
export default function markdownToHtml(markdown) {
  return marked.parse(markdown);
}
