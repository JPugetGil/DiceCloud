import { assert } from 'chai';
import frenchTypography from '/imports/ui/i18n/frenchTypography';
import fr from '/imports/ui/i18n/fr.json';

describe('French typography', function () {
  it('binds the signs to the word before them', function () {
    assert.equal(frenchTypography('C\'est votre tour !'), 'C\'est votre tour !');
    assert.equal(frenchTypography('Vraiment ? Oui ; non'), 'Vraiment ? Oui ; non');
    assert.equal(frenchTypography('Mise à jour : hier'), 'Mise à jour : hier');
    assert.equal(frenchTypography('(« le service »)'), '(« le service »)');
  });

  // fr.json is written with them, as frenchTypography would make it: a
  // plain space before a sign, straight quotes and three dots slipped in
  it('is how fr.json is written', function () {
    const slips = [];
    const walk = (messages, path) => Object.entries(messages).forEach(([key, value]) => {
      const at = path ? `${path}.${key}` : key;
      if (typeof value !== 'string') return walk(value, at);
      if (/ [:;!?]|« | »/.test(value)) slips.push(`${at}: a plain space by a sign`);
      if (value.includes('"')) slips.push(`${at}: straight quotes, not « »`);
      if (value.includes('...')) slips.push(`${at}: three dots, not …`);
    });
    walk(fr, '');
    assert.deepEqual(slips, []);
  });

  it('leaves links and code alone', function () {
    assert.equal(frenchTypography('https://example.org et mailto:a@b.c'), 'https://example.org et mailto:a@b.c');
    assert.equal(frenchTypography('arn:aws:s3:::bucket'), 'arn:aws:s3:::bucket');
  });
});
