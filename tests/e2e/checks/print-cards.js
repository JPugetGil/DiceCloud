#!/usr/bin/env node
/**
 * The printable spell and item cards (/print-cards/:id). Gives the test
 * character a prepared spell and an item from a public library, through the
 * app's insert method, then: the sheet's menu opens the cards with the spell
 * among the default ones; the page lays out a card of each; no card shows a
 * brace (casting time, range and duration are plain text whose inline
 * calculations the page works out) or overflows its body; the cards keep
 * their title in print; the PDF has one A4 page per sheet; each card has its
 * library's language; with backs (and double cards), every back sits
 * opposite its front, columns mirrored. The inserted
 * properties are removed again at the end. Skipped when the database has no
 * public library with such a spell and an item.
 */
const fs = require('fs');
const path = require('path');
const { openPage, visit } = require('../lib/browser');
const { withDb, getTestUser } = require('../lib/db');
const { createChecker, main } = require('../lib/check');
const { OUTPUT_DIR } = require('../lib/config');

const call = (page, method, args) => page.evaluate(
  ({ method, args }) => window.Meteor.callAsync(method, args), { method, args },
);

// Waits until the page has laid its cards out (or said it has none)
async function cardsLaidOut(page) {
  await page.waitForFunction(() => document.querySelector('.card-sheets .pc')
    || document.querySelector('.character-cards-printed')?.innerText.match(/No card|Aucune carte/), null, { timeout: 60000 });
  await page.waitForFunction(() => !document.body.innerText.match(/Laying out the cards|Mise en page des cartes/),
    null, { timeout: 60000 });
}

main(async () => {
  const { creatureId } = await getTestUser();
  const nodes = await withDb(async db => {
    const libraryIds = await db.collection('libraries').distinct('_id', { public: true });
    const find = filter => db.collection('libraryNodes').findOne({
      'root.id': { $in: libraryIds }, removed: { $ne: true }, ...filter,
    }, { projection: { _id: 1, name: 1 } });
    return {
      spell: await find({
        type: 'spell', level: { $gte: 1 }, school: { $exists: true }, 'description.text': { $exists: true },
        $or: [{ prepared: true }, { alwaysPrepared: true }],
      }),
      item: await find({ type: 'item', 'description.text': { $exists: true } }),
    };
  });
  const { step, finish } = createChecker('Print cards: spell and item cards');
  if (!nodes.spell || !nodes.item) {
    console.log('  (no public library with a spell and an item in this database: import one to cover the cards)');
    return finish();
  }
  const { browser, page, messages } = await openPage();
  const inserted = [];

  await step(`give the character "${nodes.spell.name}" and "${nodes.item.name}"`, messages, async () => {
    await visit(page, `/character/${creatureId}`, 0);
    await page.waitForSelector('.character-sheet-toolbar', { timeout: 60000 });
    for (const node of [nodes.spell, nodes.item]) {
      inserted.push(await call(page, 'creatureProperties.insertPropertyFromLibraryNode', {
        nodeIds: [node._id], parentRef: { collection: 'creatures', id: creatureId },
      }));
      await page.waitForTimeout(1200);
    }
    // The character recomputes: summaries and descriptions get their values
    await page.waitForTimeout(2500);
  });

  await step('the sheet\'s menu opens the cards, the prepared spell among them', messages, async () => {
    await visit(page, `/character/${creatureId}`, 0);
    await page.waitForSelector('.character-sheet-toolbar', { timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.locator('.character-sheet-toolbar button:has(.mdi-dots-vertical)').first().click();
    await page.locator('[data-id="print-cards-menu-item"]').click();
    await page.waitForURL(`**/print-cards/${creatureId}/**`, { timeout: 10000 });
    await cardsLaidOut(page);
    const names = await page.evaluate(() => [...document.querySelectorAll('.card-sheets .pc[data-side="front"][data-card="spell"] .pc-name')]
      .map(e => e.innerText));
    if (!names.includes(nodes.spell.name)) throw new Error(`no card for ${nodes.spell.name} (${names.length} spell cards)`);
    return `${names.length} spell cards by default`;
  });

  await step('the page lays out a spell card and an item card', messages, async () => {
    await visit(page, `/print-cards/${creatureId}?paper=a4&spells=all&items=all`, 0);
    await cardsLaidOut(page);
    const kinds = await page.evaluate(() => [...document.querySelectorAll('.card-sheets .pc[data-side="front"]')].map(card => card.dataset.card));
    if (!kinds.includes('spell')) throw new Error('no spell card');
    if (!kinds.includes('item')) throw new Error('no item card');
    return `${kinds.length} cards`;
  });

  await step('no card shows a brace or overflows', messages, async () => {
    const problems = await page.evaluate(() => [...document.querySelectorAll('.card-sheets .pc[data-side="front"]')].flatMap(card => {
      const name = card.querySelector('.pc-name')?.innerText;
      const body = card.querySelector('.pc-body');
      const content = card.querySelector('.pc-content');
      const overflows = card.classList.contains('pc--double')
        ? content.scrollWidth > content.clientWidth + 1
        : content.scrollHeight > body.clientHeight + 1;
      return [
        /[{}]/.test(card.innerText) && `${name}: a brace`,
        card.innerText.includes('[object') && `${name}: "[object"`,
        overflows && `${name} (${card.dataset.part}): overflows`,
      ].filter(Boolean);
    }));
    if (problems.length) throw Object.assign(new Error(`${problems.length} problems`), { details: problems });
  });

  await step('in print, the cards keep their title and the app bar goes', messages, async () => {
    await page.emulateMedia({ media: 'print' });
    const r = await page.evaluate(() => ({
      titles: [...document.querySelectorAll('.card-sheets .pc-name')].filter(e => e.offsetHeight > 0).length,
      cards: document.querySelectorAll('.card-sheets .pc[data-side="front"]').length,
      appBar: [...document.querySelectorAll('header.v-app-bar, .cards-controls')].some(e => e.offsetHeight > 0),
    }));
    // Back to the default: with 'screen' set, page.pdf() would print screen styles
    await page.emulateMedia({ media: null });
    if (r.titles < r.cards) throw new Error(`${r.cards - r.titles} cards print without their title`);
    if (r.appBar) throw new Error('the app bar or the choices print');
  });

  await step('prints one A4 page per sheet', messages, async () => {
    const sheets = await page.locator('.card-sheet').count();
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const file = path.join(OUTPUT_DIR, 'print-cards-check.pdf');
    await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
    const pdf = fs.readFileSync(file, 'latin1');
    const pages = (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length;
    // A4 in points: 595 x 842
    const a4 = /\/MediaBox\s*\[\s*0 0 59[45](\.\d+)? 84[12](\.\d+)?\s*\]/.test(pdf);
    if (pages !== sheets) throw new Error(`${pages} pages for ${sheets} sheets`);
    // The app's icon font is in the PDF only if the app bar or the choices printed
    if (pdf.includes('MaterialDesignIcons')) throw new Error('the app bar or the choices are in the PDF');
    if (!a4) throw new Error('the pages are not A4');
    return `${pages} page(s)`;
  });

  await step('each card says the language of its library, for its hyphens', messages, async () => {
    const langs = await page.evaluate(() => [...document.querySelectorAll('.card-sheets .pc[data-side="front"]')]
      .map(card => card.lang));
    const missing = langs.filter(lang => !['en', 'fr'].includes(lang)).length;
    if (missing) throw new Error(`${missing} of ${langs.length} cards without a language`);
    return [...new Set(langs)].join(', ');
  });

  await step('with backs, each sheet is followed by its backs, columns mirrored', messages, async () => {
    await visit(page, `/print-cards/${creatureId}?paper=a4&spells=all&items=all&backs=1&double=1`, 0);
    await cardsLaidOut(page);
    const r = await page.evaluate(() => {
      const sheets = [...document.querySelectorAll('.card-sheet')];
      const problems = [];
      for (let i = 0; i < sheets.length; i += 2) {
        const front = sheets[i];
        const back = sheets[i + 1];
        if (front.dataset.side !== 'front' || back?.dataset.side !== 'back') {
          problems.push(`sheet ${i}: not front then back`);
          continue;
        }
        const width = front.getBoundingClientRect().width;
        const place = (sheet, card) => {
          const s = sheet.getBoundingClientRect();
          const c = card.getBoundingClientRect();
          return { left: c.left - s.left, right: c.right - s.left, top: c.top - s.top };
        };
        for (const card of front.querySelectorAll('.pc')) {
          const backCard = back.querySelector(`.pc[data-key="${card.dataset.key}"]`);
          if (!backCard) { problems.push(`${card.dataset.key}: no back`); continue; }
          const f = place(front, card);
          const b = place(back, backCard);
          if (Math.abs(b.left - (width - f.right)) > 1 || Math.abs(b.top - f.top) > 1) {
            problems.push(`${card.dataset.key}: back at ${Math.round(b.left)},${Math.round(b.top)} for ${Math.round(width - f.right)},${Math.round(f.top)}`);
          }
        }
      }
      return { sheets: sheets.length, problems };
    });
    if (r.problems.length) throw Object.assign(new Error(`${r.problems.length} misplaced backs`), { details: r.problems.slice(0, 8) });
    return `${r.sheets / 2} sheet(s), front and back`;
  });

  await step('clean up the inserted properties', messages, async () => {
    for (const _id of inserted) {
      await call(page, 'creatureProperties.softRemove', { _id });
      await page.waitForTimeout(1200);
    }
  });

  await browser.close();
  finish();
});
