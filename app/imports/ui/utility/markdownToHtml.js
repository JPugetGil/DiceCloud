import { Marked, Renderer } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import { t } from '/imports/ui/i18n';
import { DICE_ROLL_AT_START, parseDice } from '/imports/ui/dice/logDice';

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

// The dice of a roll in the log, `1d20 [ 15, ~~8~~ ]`, drawn one by one;
// stylesheets/logRolls.css draws them and rolls them in
const diceRolls = {
  extensions: [{
    name: 'diceRoll',
    level: 'inline',
    start(src) {
      const index = src.search(/(?<!\w)\d*d\d+ ?\[/);
      return index === -1 ? undefined : index;
    },
    tokenizer(src) {
      const match = DICE_ROLL_AT_START.exec(src);
      if (!match) return;
      const dice = parseDice(match[3]);
      if (!dice) return;
      return { type: 'diceRoll', raw: match[0], notation: `${match[1]}d${match[2]}`, diceSize: +match[2], dice };
    },
    renderer({ notation, diceSize, dice }) {
      const chips = dice.map((die, index) => {
        const classes = ['log-die'];
        let label;
        if (diceSize === 20) classes.push('log-die--d20');
        if (die.dropped) classes.push('log-die--dropped');
        else if (diceSize === 20 && die.value === 20) {
          classes.push('log-die--crit');
          label = t('log.natural20');
        } else if (diceSize === 20 && die.value === 1) {
          classes.push('log-die--fumble');
          label = t('log.natural1');
        }
        if (die.bold) classes.push('font-weight-bold');
        if (die.italics) classes.push('font-italic');
        if (die.underline) classes.push('text-decoration-underline');
        const value = die.dropped ? `<del>${die.value}</del>` : `${die.value}`;
        const title = (die.dropped ? t('log.droppedDie') : label)?.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
        return `<span class="${classes.join(' ')}" style="--i: ${index}"`
          + `${title ? ` title="${title}"` : ''}>${value}</span>`
          + (title ? `<span class="d-sr-only"> (${title})</span>` : '');
      });
      return `<span class="log-roll"><span class="text-medium-emphasis">${notation}</span> ${chips.join('')}</span>`;
    },
  }],
};

const base = Renderer.prototype;
// Adds classes to the element an html string starts with, if it is that tag
const addClass = (html, tag, classes) => html.replace(new RegExp(`^<${tag}\\b`), `<${tag} class="${classes}"`);

const createMarked = (...extensions) => new Marked(
  { breaks: true, gfm: true, silent: true },
  ...extensions,
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
function withHeadingClasses(marked) {
  const renderer = marked.defaults.renderer;
  const headingWithId = renderer.heading;
  renderer.heading = function (token) {
    return addClass(headingWithId.call(this, token), `h${token.depth}`, `${HEADINGS[token.depth]} mt-6 mb-3`);
  };
  return marked;
}

const marked = withHeadingClasses(createMarked());
const logMarked = withHeadingClasses(createMarked(diceRolls));

/**
 * Markdown to HTML, unsanitized: sanitize it before putting it in the page.
 * `dice` draws the dice of rolls, as the log writes them.
 */
export default function markdownToHtml(markdown, { dice = false } = {}) {
  return (dice ? logMarked : marked).parse(markdown);
}
