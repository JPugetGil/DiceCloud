#!/usr/bin/env node
/**
 * Licences and credits. The About page carries, word for word, the
 * attribution statement of each edition of the SRD 5.1 (the statement its
 * legal page fixes, which the bestiaries' descriptions repeat), the note on
 * Section 5 of CC BY 4.0, what DiceCloud changed, and the icons' credit. A
 * library under the SRD 5.1 says so on its page, with a link to that section.
 * When the SRD's text extracts are at hand (tools/monsters/work), the
 * statements are also compared with their page 1. Read-only.
 */
const fs = require('fs');
const path = require('path');
const { openPage, visit } = require('../lib/browser');
const { withDb } = require('../lib/db');
const { createChecker, main } = require('../lib/check');

// The SRD's own text, page 1, where it is (tools/ is not in git)
const SRD_TEXTS = {
  en: path.join(__dirname, '..', '..', '..', 'tools', 'monsters', 'work', 'SRD_CC_v5.1.txt'),
  fr: path.join(__dirname, '..', '..', '..', 'tools', 'monsters', 'work', 'SRD_CC_v5.1_FR.txt'),
};
const OPENING = { en: 'This work includes material', fr: 'Ce travail comprend la documentation' };
// Spaces of any kind (the French one is typeset with no-break spaces), quotes as one
const normalize = text => text.replace(/\s+/g, ' ').replace(/[’‘]/g, '\'').trim();

/**
 * The statement, from its opening words to the licence's address and its full
 * stop. An address the PDF breaks across lines ("reference- document") is
 * joined again
 */
function statementIn(text, lang) {
  const flat = normalize(text).replace(/(\w)- (\w)/g, '$1-$2');
  const start = flat.indexOf(OPENING[lang]);
  if (start === -1) return undefined;
  const end = /legalcode(\.fr)?\./.exec(flat.slice(start));
  return end ? flat.slice(start, start + end.index + end[0].length) : undefined;
}

main(async () => {
  const libraries = await withDb(db => db.collection('libraries')
    .find({ license: 'srd-5.1' }, { projection: { name: 1, description: 1, language: 1 } }).toArray());
  const { step, finish } = createChecker('Licences and credits');
  const visitor = await openPage({ signedIn: false });
  try {
    let about;
    await step('the About page has its licences and credits section', visitor.messages, async () => {
      await visit(visitor.page, '/about#licenses', 4000);
      about = await visitor.page.evaluate(() => ({
        section: document.querySelector('.about__licenses')?.innerText || '',
        editions: [...document.querySelectorAll('[data-id^="srd-attribution-"] blockquote')].map(el => el.lang),
        disclaimer: document.querySelector('[data-id="srd-disclaimer"]')?.innerText || '',
        changes: document.querySelector('[data-id="srd-changes"]')?.innerText || '',
        icons: document.querySelector('[data-id="icons-credit"]')?.innerText || '',
        heading: document.getElementById('licenses')?.getBoundingClientRect().top,
      }));
      if (!about.section) throw new Error('no licences section');
      if (about.editions.join() !== 'en,fr') throw new Error(`editions in the order ${about.editions.join()}, not en,fr`);
      if (!about.disclaimer.includes('Section 5 of CC-BY-4.0')) throw new Error('no note on Section 5 of CC BY 4.0');
      if (!/stat blocks/.test(about.changes) || !/metres/.test(about.changes)) throw new Error(`changes read "${about.changes}"`);
      if (!about.icons.includes('game-icons.net')) throw new Error('no credit for the icons');
      if (!(about.heading < 400)) throw new Error(`#licenses is ${about.heading}px down the page, not scrolled to`);
    });

    for (const lang of ['en', 'fr']) {
      await step(`its ${lang === 'en' ? 'English' : 'French'} statement is the SRD 5.1's own, word for word`, null, async () => {
        const shown = statementIn(about?.section || '', lang);
        if (!shown) throw new Error('not on the page');
        const sources = [];
        const library = libraries.find(lib => lib.language === lang);
        if (library) sources.push([`the "${library.name}" library's description`, statementIn(library.description || '', lang)]);
        if (fs.existsSync(SRD_TEXTS[lang])) {
          const page1 = fs.readFileSync(SRD_TEXTS[lang], 'utf8').split('=====PAGE 2=====')[0];
          sources.push(['the SRD 5.1\'s page 1', statementIn(page1, lang)]);
        }
        if (!sources.length) throw new Error('nothing to compare with: no SRD 5.1 library, no SRD text');
        for (const [name, expected] of sources) {
          if (shown !== expected) {
            throw Object.assign(new Error(`differs from ${name}`), { details: [`page:   ${shown}`, `source: ${expected}`] });
          }
        }
        return `matches ${sources.map(([name]) => name).join(' and ')}`;
      });
    }

    await step('a library under the SRD 5.1 shows its licence, linked to that section', visitor.messages, async () => {
      const library = libraries[0];
      if (!library) throw new Error('no library under the SRD 5.1 (import the bestiaries)');
      const reader = await openPage();
      try {
        await visit(reader.page, `/library/${library._id}`, 5000);
        const line = await reader.page.evaluate(() => {
          const el = document.querySelector('[data-id="license-line"]');
          return el && { text: el.innerText.trim(), href: el.querySelector('a')?.getAttribute('href') };
        });
        if (!line) throw new Error('no licence on the library page');
        if (line.text !== 'SRD 5.1 · CC BY 4.0' || line.href !== '/about#licenses') {
          throw new Error(`the licence reads "${line?.text}", linked to ${line?.href}`);
        }
        if (reader.messages.length) throw new Error(reader.messages[0]);
        return `${library.name}: ${line.text}`;
      } finally {
        await reader.browser.close();
      }
    });
  } finally {
    await visitor.browser.close();
  }
  finish();
});
