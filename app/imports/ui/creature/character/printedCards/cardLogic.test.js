import { assert } from 'chai';
import {
  CARD, PAPERS, paperMargins, defaultPaper, cropMarks, toSheets, fitFontSize, paginate,
  nearestAncestor, selectSpells, selectItems, itemRarity, itemCharges, spellUses,
  componentCodes, capitalizeFirst, itemKind, packCards, mirrorPlacement, cardColor,
} from './cardLogic';

describe('Printable cards: sheets', function () {
  it('centres a 3 x 3 grid of 63 x 88 mm cards on A4 and Letter', function () {
    assert.deepEqual(paperMargins('a4'), { x: 10.5, y: 16.5 });
    assert.deepEqual(paperMargins('letter'), { x: 13.45, y: 7.7 });
    for (const paper of Object.keys(PAPERS)) {
      const { x, y } = paperMargins(paper);
      assert.approximately(2 * x + 3 * CARD.width, PAPERS[paper].width, 0.01);
      assert.approximately(2 * y + 3 * CARD.height, PAPERS[paper].height, 0.01);
    }
  });

  it('picks Letter in the United States and Canada, A4 elsewhere', function () {
    assert.equal(defaultPaper('en-US'), 'letter');
    assert.equal(defaultPaper('fr-CA'), 'letter');
    assert.equal(defaultPaper('fr-FR'), 'a4');
    assert.equal(defaultPaper('en-GB'), 'a4');
    assert.equal(defaultPaper(undefined), 'a4');
  });

  it('puts the crop marks in the margins, in line with the cards\' edges', function () {
    for (const paper of Object.keys(PAPERS)) {
      const marks = cropMarks(paper);
      const { x, y } = paperMargins(paper);
      assert.lengthOf(marks, 16);
      for (const mark of marks) {
        const vertical = mark.x1 === mark.x2;
        const inGrid = vertical
          ? Math.min(mark.y1, mark.y2) >= y && Math.max(mark.y1, mark.y2) <= y + 3 * CARD.height
          : Math.min(mark.x1, mark.x2) >= x && Math.max(mark.x1, mark.x2) <= x + 3 * CARD.width;
        assert.isFalse(inGrid, `${paper}: a mark over the cards`);
        assert.isAtLeast(Math.min(mark.x1, mark.x2, mark.y1, mark.y2), 0, `${paper}: a mark off the sheet`);
        if (vertical) assert.include([0, 1, 2, 3].map(i => Math.round((x + i * CARD.width) * 100) / 100), mark.x1);
      }
    }
  });

  it('puts nine cards on a sheet', function () {
    assert.deepEqual(toSheets([...Array(20).keys()]).map(sheet => sheet.length), [9, 9, 2]);
    assert.deepEqual(toSheets([]), []);
  });
});

describe('Printable cards: fitting the text', function () {
  it('finds the largest font size that fits, between 6.5 and 8 pt', function () {
    const fitsUpTo = limit => size => size <= limit;
    assert.equal(fitFontSize({ min: 6.5, max: 8, step: 0.25, fits: fitsUpTo(9) }), 8);
    assert.equal(fitFontSize({ min: 6.5, max: 8, step: 0.25, fits: fitsUpTo(7.3) }), 7.25);
    assert.equal(fitFontSize({ min: 6.5, max: 8, step: 0.25, fits: fitsUpTo(6.5) }), 6.5);
    assert.isUndefined(fitFontSize({ min: 6.5, max: 8, step: 0.25, fits: fitsUpTo(6) }));
  });

  it('measures only a handful of times', function () {
    let calls = 0;
    fitFontSize({ min: 6.5, max: 8, step: 0.25, fits: size => { calls++; return size <= 7; } });
    assert.isAtMost(calls, 4);
  });

  it('splits words over cards, each taking as many as it holds', function () {
    // The first card holds 10 words, the continuation cards 25
    const fits = (card, start, end) => end - start <= (card === 0 ? 10 : 25);
    assert.deepEqual(paginate(60, fits), [[0, 10], [10, 35], [35, 60]]);
    assert.deepEqual(paginate(8, fits), [[0, 8]]);
    assert.deepEqual(paginate(0, fits), []);
  });

  it('still moves on when a single atom is too large for a card', function () {
    const fits = (card, start, end) => end - start <= (start === 3 ? 0 : 3);
    assert.deepEqual(paginate(7, fits), [[0, 3], [3, 4], [4, 7]]);
  });

  it('stops at a maximum number of cards, the rest on the last one', function () {
    const ranges = paginate(100, (card, start, end) => end - start <= 1, { maxCards: 4 });
    assert.lengthOf(ranges, 4);
    assert.deepEqual(ranges[3], [3, 100]);
  });
});

describe('Printable cards: what gets a card', function () {
  const wizard = { _id: 'wizard', type: 'spellList', left: 1, right: 10 };
  const cleric = { _id: 'cleric', type: 'spellList', left: 11, right: 20 };
  const spell = (name, left, extra = {}) => ({ _id: name, name, type: 'spell', left, right: left + 1, level: 1, ...extra });
  const spells = [
    spell('fireBolt', 2, { level: 0 }),
    spell('shield', 4, { prepared: true }),
    spell('sleep', 6),
    spell('bless', 12, { alwaysPrepared: true }),
    spell('wandSpell', 30, { prepared: true, deactivatedByAncestor: true }),
  ];

  it('prints the prepared, always prepared and cantrips by default', function () {
    assert.deepEqual(selectSpells(spells).map(s => s._id), ['fireBolt', 'shield', 'bless']);
  });

  it('prints every spell, or one spell list, on request', function () {
    assert.deepEqual(selectSpells(spells, { mode: 'all' }).map(s => s._id), ['fireBolt', 'shield', 'sleep', 'bless']);
    assert.deepEqual(selectSpells(spells, { mode: 'all', listId: 'wizard', lists: [wizard, cleric] }).map(s => s._id),
      ['fireBolt', 'shield', 'sleep']);
    assert.deepEqual(selectSpells(spells, { mode: 'none' }), []);
    assert.deepEqual(selectSpells(spells, { listId: 'gone', lists: [wizard] }), []);
  });

  it('finds the spell list a spell belongs to', function () {
    const nested = { _id: 'nested', left: 3, right: 8 };
    assert.equal(nearestAncestor(spells[1], [wizard, cleric])._id, 'wizard');
    assert.equal(nearestAncestor(spells[1], [wizard, nested, cleric])._id, 'nested');
    assert.isUndefined(nearestAncestor(spell('loose', 40), [wizard, cleric]));
  });

  const pack = { _id: 'pack', type: 'container', left: 1, right: 10, carried: true };
  const chest = { _id: 'chest', type: 'container', left: 11, right: 20, carried: false };
  const item = (name, left, extra = {}) => ({ _id: name, type: 'item', left, right: left + 1, ...extra });
  const items = [
    item('sword', 30, { equipped: true }),
    item('rope', 2),
    item('gold', 12),
    item('wand', 32, { equipped: true, removed: true }),
  ];

  it('prints the equipped items by default, or the carried ones, or a container', function () {
    assert.deepEqual(selectItems(items, [pack, chest]).map(i => i._id), ['sword']);
    assert.deepEqual(selectItems(items, [pack, chest], { mode: 'carried' }).map(i => i._id), ['sword', 'rope']);
    assert.deepEqual(selectItems(items, [pack, chest], { mode: 'all', containerId: 'chest' }).map(i => i._id), ['gold']);
    assert.deepEqual(selectItems(items, [pack, chest], { mode: 'none' }), []);
  });
});

describe('Printable cards: what a card says', function () {
  it('reads the rarity from the English tags, the rarest one', function () {
    assert.equal(itemRarity(['magic', 'uncommon', 'wondrous item']), 'uncommon');
    assert.equal(itemRarity(['very rare', 'LoV']), 'veryRare');
    assert.equal(itemRarity(['rare', 'legendary']), 'legendary');
    assert.equal(itemRarity(['Artifact']), 'artifact');
    assert.isUndefined(itemRarity(['magic', 'wand']));
    assert.isUndefined(itemRarity(undefined));
  });

  const wand = { _id: 'wand', type: 'item', left: 1, right: 10 };

  it('counts charges from a resource attribute inside the item', function () {
    const inside = [
      { type: 'attribute', attributeType: 'healthBar', total: 7, value: 7, left: 2, right: 3 },
      { type: 'attribute', attributeType: 'resource', total: 7, value: 5, left: 4, right: 5 },
    ];
    assert.deepEqual(itemCharges(wand, inside), { left: 5, max: 7 });
  });

  it('else from an action with uses, and ignores what is outside the item', function () {
    const inside = [
      { type: 'attribute', attributeType: 'resource', total: 3, value: 3, left: 20, right: 21 },
      { type: 'action', uses: { value: 3 }, usesUsed: 1, reset: 'longRest', left: 2, right: 3 },
    ];
    assert.deepEqual(itemCharges(wand, inside), { left: 2, max: 3, reset: 'longRest' });
    assert.isUndefined(itemCharges(wand, []));
  });

  it('gives a spell\'s uses and its components', function () {
    assert.deepEqual(spellUses({ uses: { value: 1 }, usesLeft: 1, reset: 'longRest' }), { left: 1, max: 1, reset: 'longRest' });
    assert.isUndefined(spellUses({ uses: { value: 0 } }));
    assert.deepEqual(componentCodes({ verbal: true, somatic: false, material: 'a pinch of dust' }), ['V', 'M']);
  });

  it('capitalises the first letter of upstream values', function () {
    assert.equal(capitalizeFirst('action'), 'Action');
    assert.equal(capitalizeFirst('jusqu\'à 1 minute'), 'Jusqu\'à 1 minute');
    assert.equal(capitalizeFirst(''), '');
  });
});

describe('Printable cards: comfort', function () {
  it('tells an item\'s kind from its tags, for its icon', function () {
    assert.equal(itemKind(['magic', 'wand', 'LoV', 'uncommon']), 'wand');
    assert.equal(itemKind(['martial weapon', 'melee weapon', 'longsword']), 'weapon');
    assert.equal(itemKind(['magic', 'staff', 'simple weapon', 'quarterstaff']), 'staff');
    assert.equal(itemKind(['medium armor', 'Scale Mail']), 'armor');
    assert.equal(itemKind(['wondrous item', 'attunement']), 'wondrous');
    assert.equal(itemKind(['trinket']), 'gear');
    assert.equal(itemKind(undefined), 'gear');
  });

  it('packs single and double cards, a single card filling the hole a double one leaves', function () {
    const card = (name, span = 1) => ({ name, span });
    const sheets = packCards([card('a'), card('b'), card('long', 2), card('long2', 2), card('c'), card('d')]);
    const at = sheets[0].cells.map(({ card, row, col, span }) => `${card.name}@${row}${col}x${span}`);
    assert.deepEqual(at, ['a@00x1', 'b@01x1', 'long@10x2', 'long2@20x2', 'c@02x1', 'd@12x1']);
    assert.lengthOf(packCards([...Array(10).keys()].map(i => card(i))), 2);
    assert.lengthOf(packCards([...Array(4).keys()].map(i => card(i, 2))), 2);
  });

  it('mirrors a card\'s back over the long edge, a double card too', function () {
    assert.deepEqual(mirrorPlacement({ row: 1, col: 0, span: 1 }), { row: 1, col: 2, span: 1 });
    assert.deepEqual(mirrorPlacement({ row: 2, col: 1, span: 1 }), { row: 2, col: 1, span: 1 });
    assert.deepEqual(mirrorPlacement({ row: 0, col: 0, span: 2 }), { row: 0, col: 1, span: 2 });
    assert.deepEqual(mirrorPlacement({ row: 0, col: 1, span: 2 }), { row: 0, col: 0, span: 2 });
  });

  it('colours a card like its spell list, else like the character', function () {
    assert.equal(cardColor({ list: { color: '#3F51B5' }, creature: { color: '#E91E63' } }), '#3F51B5');
    assert.equal(cardColor({ list: {}, creature: { color: '#E91E63' } }), '#E91E63');
    assert.isUndefined(cardColor({ list: { color: 'blue' } }));
    assert.isUndefined(cardColor());
  });
});
