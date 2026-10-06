import { assert } from 'chai';
import {
  PAGE_SIZES, CONTENT, pageMargins, cssString, pageRules, proficiencyMark, spellsByLevel, signed, damageText,
} from './officialLogic';

describe('Official-looking sheet: pages', function () {
  it('centres the same 186 x 250 mm grid on A4 and Letter, room left above for the header', function () {
    for (const paper of Object.keys(PAGE_SIZES)) {
      const m = pageMargins(paper);
      assert.approximately(m.left + CONTENT.width + m.right, PAGE_SIZES[paper].width, 0.02);
      assert.approximately(m.top + CONTENT.height + m.bottom, PAGE_SIZES[paper].height, 0.02);
      assert.isAtLeast(m.top, 10, paper);
      assert.isAtLeast(m.bottom, 8, paper);
    }
  });

  it('writes any text as a CSS string', function () {
    assert.equal(cssString('Elara "the Wise"'), '"Elara \\"the Wise\\""');
    assert.equal(cssString('a\\b\nc'), '"a\\\\b c"');
    assert.equal(cssString(undefined), '""');
  });

  it('gives each named page its size, margins and running header', function () {
    const css = pageRules({
      paper: 'letter', headerRight: 'Compatible 5e', footer: 'Page ',
      pages: [{ name: 'os-sheet', title: 'Elara — Wizard 5' }, { name: 'os-spells', title: 'Spells' }],
    });
    assert.include(css, '@page os-sheet {');
    assert.include(css, '@page os-spells {');
    assert.include(css, 'size: letter portrait;');
    assert.include(css, '@top-left { content: "Elara — Wizard 5";');
    assert.include(css, '@bottom-right { content: "Page " counter(page);');
  });
});

describe('Official-looking sheet: content', function () {
  it('marks proficiency, half proficiency and expertise', function () {
    assert.equal(proficiencyMark(0), 'none');
    assert.equal(proficiencyMark(undefined), 'none');
    assert.equal(proficiencyMark(0.5), 'half');
    assert.equal(proficiencyMark(0.49), 'half');
    assert.equal(proficiencyMark(1), 'proficient');
    assert.equal(proficiencyMark(2), 'expertise');
  });

  it('groups spells by level with their slots, skipping empty levels', function () {
    const spells = [
      { name: 'Shield', level: 1 }, { name: 'Fire Bolt', level: 0 }, { name: 'Detect Magic', level: 1 },
      { name: 'Fireball', level: 3 },
    ];
    const slots = [
      { spellSlotLevel: { value: 1 }, total: 4 }, { spellSlotLevel: { value: 2 }, total: 3 },
      { spellSlotLevel: { value: 3 }, total: 2 }, { spellSlotLevel: { value: 4 }, total: 0 },
    ];
    const levels = spellsByLevel(spells, slots, 'en');
    assert.deepEqual(levels.map(l => [l.level, l.slots, l.spells.map(s => s.name)]), [
      [0, 0, ['Fire Bolt']], [1, 4, ['Detect Magic', 'Shield']], [2, 3, []], [3, 2, ['Fireball']],
    ]);
  });

  it('prints modifiers with a sign and a true minus', function () {
    assert.equal(signed(3), '+3');
    assert.equal(signed(0), '+0');
    assert.equal(signed(-1), '−1');
    assert.equal(signed(undefined), '');
  });

  it('gives an attack its first damage that is not nothing', function () {
    assert.equal(damageText([{ amount: { value: 'd6-1' }, damageType: 'bludgeoning' }]), 'd6 - 1 bludgeoning');
    assert.equal(damageText([{ amount: { value: 0 }, damageType: 'force' }, { amount: { value: '1d10' }, damageType: 'fire' }],
      type => ({ fire: 'feu' })[type]), '1d10 feu');
    assert.equal(damageText([]), '');
  });
});
