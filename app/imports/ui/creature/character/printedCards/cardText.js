import { fitFontSize, paginate } from './cardLogic';

/**
 * The app's markdown HTML, made for a card: a table without Vuetify's
 * wrappers (`div.v-table`), and no utility classes (their margins are sized
 * for the screen, in px); the card's own styles take over. `html` must be
 * sanitised already.
 */
export function prepareCardHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html || '';
  template.content.querySelectorAll('div.v-table').forEach(wrapper => {
    const table = wrapper.querySelector('table');
    if (table) wrapper.replaceWith(table);
  });
  template.content.querySelectorAll('[class]').forEach(element => element.removeAttribute('class'));
  template.content.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
  return template.innerHTML.trim();
}

/**
 * The body of a card as atoms that a card can break between: the words of a
 * paragraph, a heading or a list item, the rows of a table, or a whole block
 * with no text (a rule, an image). `render(start, end)` gives the HTML of a
 * run of atoms with the markup they sit in: a paragraph cut in two keeps its
 * bold and italics, a list keeps its numbering (`start`), a table its header.
 *
 * `html` must already be sanitised (it is put back as markup).
 */
export function atomize(html) {
  const template = document.createElement('template');
  template.innerHTML = html || '';
  /** @type {Element[]} */
  const blocks = [...template.content.childNodes].filter(node =>
    node.nodeType === Node.ELEMENT_NODE || (node.textContent || '').trim()
  ).map(node => {
    if (node instanceof Element) return node;
    const paragraph = document.createElement('p');
    paragraph.textContent = node.textContent;
    return paragraph;
  });
  const atoms = [];
  blocks.forEach((block, blockIndex) => {
    const tag = block.tagName;
    if (tag === 'TABLE') {
      const rows = block.querySelectorAll(':scope > tbody > tr, :scope > tr');
      rows.forEach((row, rowIndex) => atoms.push({ blockIndex, rowIndex }));
      if (!rows.length) atoms.push({ blockIndex, whole: true });
    } else if (tag === 'UL' || tag === 'OL') {
      const items = [...block.children].filter(child => child.tagName === 'LI');
      items.forEach((item, itemIndex) => {
        const words = countWords(item);
        for (let word = 0; word < Math.max(words, 1); word++) atoms.push({ blockIndex, itemIndex, word });
      });
      if (!items.length) atoms.push({ blockIndex, whole: true });
    } else {
      const words = countWords(block);
      if (!words) atoms.push({ blockIndex, whole: true });
      for (let word = 0; word < words; word++) atoms.push({ blockIndex, word });
    }
  });

  function render(start, end) {
    const out = document.createElement('div');
    let i = start;
    while (i < end) {
      const { blockIndex } = atoms[i];
      let j = i;
      while (j < end && atoms[j].blockIndex === blockIndex) j++;
      out.appendChild(renderBlock(blocks[blockIndex], atoms.slice(i, j)));
      i = j;
    }
    return out.innerHTML;
  }

  return { count: atoms.length, render };
}

function renderBlock(block, atoms) {
  const tag = block.tagName;
  if (atoms[0].whole) return block.cloneNode(true);
  if (tag === 'TABLE') {
    const table = block.cloneNode(true);
    const keep = new Set(atoms.map(atom => atom.rowIndex));
    table.querySelectorAll(':scope > tbody > tr, :scope > tr').forEach((row, index) => {
      if (!keep.has(index)) row.remove();
    });
    return table;
  }
  if (tag === 'UL' || tag === 'OL') {
    const list = block.cloneNode(true);
    const byItem = new Map();
    for (const atom of atoms) {
      const range = byItem.get(atom.itemIndex) || [atom.word, atom.word + 1];
      byItem.set(atom.itemIndex, [Math.min(range[0], atom.word), Math.max(range[1], atom.word + 1)]);
    }
    const items = [...list.children].filter(child => child.tagName === 'LI');
    items.forEach((item, index) => {
      if (!byItem.has(index)) item.remove();
      else keepWords(item, ...byItem.get(index));
    });
    if (tag === 'OL') {
      const first = Math.min(...byItem.keys());
      list.setAttribute('start', String((parseInt(block.getAttribute('start'), 10) || 1) + first));
    }
    return list;
  }
  const copy = block.cloneNode(true);
  keepWords(copy, atoms[0].word, atoms[atoms.length - 1].word + 1);
  return copy;
}

const WORD = /\S+/g;

function textNodes(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

function countWords(element) {
  return textNodes(element).reduce((sum, node) => sum + ((node.textContent || '').match(WORD) || []).length, 0);
}

/** Keeps the words [start, end) of an element, wherever its markup puts them */
function keepWords(element, start, end) {
  let index = 0;
  for (const node of textNodes(element)) {
    const tokens = (node.textContent || '').split(/(\s+)/);
    let kept = '';
    for (const token of tokens) {
      if (!token) continue;
      if (/^\s+$/.test(token)) {
        if (index > start && index < end) kept += token;
        continue;
      }
      if (index >= start && index < end) kept += token;
      index++;
    }
    node.textContent = kept;
  }
}

export const FONT_SIZES = Object.freeze({ min: 6.5, max: 8, step: 0.25 });

/**
 * Lays one card's body out, measured in the page: `first` and `next` are a
 * first card and a continuation card of it, rendered off screen at print size
 * (their `.pc-body` has the room the body gets, `.pc-content` holds it).
 *
 * The whole text on the first card at the largest size from 8 down to 6.5 pt;
 * failing that, as many cards as it takes at 6.5 pt, then the largest size
 * that still needs no more cards. Every part of a card shares one size.
 * A double card (`columns`) sets its text in two columns: what does not fit
 * spills into a third, so it overflows sideways.
 * Returns [{ html, fontSize }], one per card.
 * @param {string} html
 * @param {any} first
 * @param {any} next
 * @param {{ min: number, max: number, step: number }} [sizes]
 * @param {{ columns?: boolean }} [options]
 */
export function layoutCardBody(html, first, next, sizes = FONT_SIZES, { columns = false } = {}) {
  const target = element => ({
    body: element.querySelector('.pc-body'),
    content: element.querySelector('.pc-content'),
  });
  const firstCard = target(first);
  const nextCard = target(next);
  const fits = ({ body, content }, fragment, size) => {
    body.style.fontSize = `${size}pt`;
    content.innerHTML = fragment;
    return columns
      ? content.scrollWidth <= content.clientWidth + 1
      : content.scrollHeight <= body.clientHeight + 0.5;
  };
  const whole = html || '';
  const single = fitFontSize({ ...sizes, fits: size => fits(firstCard, whole, size) });
  if (single !== undefined) return [{ html: whole, fontSize: single }];

  const text = atomize(whole);
  const rangesAt = size => paginate(text.count, (card, start, end) =>
    fits(card === 0 ? firstCard : nextCard, text.render(start, end), size)
  );
  const cards = rangesAt(sizes.min).length;
  const fontSize = fitFontSize({ ...sizes, fits: size => rangesAt(size).length <= cards }) ?? sizes.min;
  return rangesAt(fontSize).map(([start, end]) => ({ html: text.render(start, end), fontSize }));
}
