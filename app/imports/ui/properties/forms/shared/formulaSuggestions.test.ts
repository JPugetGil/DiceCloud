import { assert } from 'chai';
import {
  applySuggestion, getWordAtCaret, rankSuggestions, type FormulaSuggestion,
} from '/imports/ui/properties/forms/shared/formulaSuggestions';

const variable = (label: string, detail?: string): FormulaSuggestion =>
  ({ insert: label, label, detail, kind: 'variable' });
const fn = (label: string): FormulaSuggestion => ({ insert: `${label}(`, label, kind: 'function' });

describe('Formula suggestions', function () {
  describe('getWordAtCaret', function () {
    it('finds the name the caret is in or after', function () {
      assert.deepEqual(getWordAtCaret('1 + stre', 8), { start: 4, end: 8, word: 'stre' });
      assert.deepEqual(getWordAtCaret('stre + 1', 2), { start: 0, end: 4, word: 'stre' });
      assert.deepEqual(getWordAtCaret('max(dex_mod', 11), { start: 4, end: 11, word: 'dex_mod' });
    });

    it('suggests nothing off a name, after a dot, in a string or after a digit', function () {
      assert.isUndefined(getWordAtCaret('1 + ', 4));
      assert.isUndefined(getWordAtCaret('strength.mod', 12), 'a property of the variable');
      assert.isUndefined(getWordAtCaret('"abc', 4), 'inside a string');
      assert.isUndefined(getWordAtCaret('2d6', 3), 'a dice roll');
      assert.isUndefined(getWordAtCaret('', 0));
      assert.isUndefined(getWordAtCaret('abc', 9));
    });
  });

  describe('rankSuggestions', function () {
    const suggestions = [
      variable('strength'), variable('strengthSave'), variable('dexterity'),
      variable('proficiencyBonus'), variable('heavyArmorStrength'), fn('max'), fn('min'),
    ];

    it('puts names starting with the word first, shortest first, case aside', function () {
      assert.deepEqual(rankSuggestions(suggestions, 'STR').map(s => s.label),
        ['strength', 'strengthSave', 'heavyArmorStrength']);
      assert.deepEqual(rankSuggestions(suggestions, 'm').map(s => s.label).slice(0, 2), ['max', 'min']);
    });

    it('suggests nothing for a name typed in full, or for nothing', function () {
      assert.isEmpty(rankSuggestions(suggestions, 'dexterity'));
      assert.isEmpty(rankSuggestions(suggestions, ''));
    });

    it('keeps to the limit', function () {
      assert.lengthOf(rankSuggestions(suggestions, 'e', 3), 3);
    });
  });

  describe('applySuggestion', function () {
    it('replaces the whole word, and puts the caret after the name', function () {
      const text = '1 + stre * 2';
      const range = getWordAtCaret(text, 6)!;
      assert.deepEqual(applySuggestion(text, range, variable('strength')), { text: '1 + strength * 2', caret: 12 });
    });

    it('opens a function\'s parenthesis, or keeps the one there', function () {
      assert.deepEqual(applySuggestion('ma', getWordAtCaret('ma', 2)!, fn('max')), { text: 'max(', caret: 4 });
      assert.deepEqual(applySuggestion('ma(1, 2)', getWordAtCaret('ma(1, 2)', 2)!, fn('max')),
        { text: 'max(1, 2)', caret: 4 });
    });
  });
});
