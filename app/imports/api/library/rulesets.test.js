import { assert } from 'chai';
import { guessLanguage, plainSummary, preferredRuleset } from '/imports/api/library/rulesets';

describe('Rulesets offered at character creation', function () {
  it('guesses a collection\'s language from its words', function () {
    assert.equal(guessLanguage('**Les Bibliothèques de Vexus : D&D 5e (2014), automatisé.** Tous les peuples, classes et sous-classes'), 'fr');
    assert.equal(guessLanguage('**The Libraries of Vexus: D&D 5e (2014), automated.** Every race, class and subclass of the game'), 'en');
    assert.isUndefined(guessLanguage(''));
    assert.isUndefined(guessLanguage('D&D 5e (2014)'));
  });

  it('sums a description up in one plain line', function () {
    assert.equal(plainSummary('**Bold title.**\n\nSecond paragraph'), 'Bold title.');
    assert.equal(plainSummary('a'.repeat(200), 20), `${'a'.repeat(19)}…`);
  });

  it('prefers the interface\'s language, then what the user follows', function () {
    const english = { nodeId: 'en', language: 'en', followed: true };
    const french = { nodeId: 'fr', language: 'fr', followed: false };
    const other = { nodeId: 'x', language: undefined, followed: false };
    assert.equal(preferredRuleset([english, french], 'fr'), french);
    assert.equal(preferredRuleset([english, french], 'en'), english);
    assert.equal(preferredRuleset([other, english], 'de'), english);
    assert.equal(preferredRuleset([other], 'fr'), other);
    assert.isUndefined(preferredRuleset([], 'fr'));
  });

  it('then the one the admins recommend', function () {
    const plain = { nodeId: 'a', language: 'fr', followed: false };
    const recommended = { nodeId: 'b', language: 'fr', followed: false, recommended: true };
    const followed = { nodeId: 'c', language: 'fr', followed: true };
    assert.equal(preferredRuleset([plain, recommended], 'fr'), recommended);
    assert.equal(preferredRuleset([plain, recommended, followed], 'fr'), followed);
  });
});
