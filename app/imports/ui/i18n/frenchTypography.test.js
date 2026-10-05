import { assert } from 'chai';
import frenchTypography from '/imports/ui/i18n/frenchTypography';

describe('French typography', function () {
  it('binds the signs to the word before them', function () {
    assert.equal(frenchTypography('C\'est votre tour !'), 'C\'est votre tour !');
    assert.equal(frenchTypography('Vraiment ? Oui ; non'), 'Vraiment ? Oui ; non');
    assert.equal(frenchTypography('Mise à jour : hier'), 'Mise à jour : hier');
    assert.equal(frenchTypography('(« le service »)'), '(« le service »)');
  });

  it('leaves links and code alone', function () {
    assert.equal(frenchTypography('https://example.org et mailto:a@b.c'), 'https://example.org et mailto:a@b.c');
    assert.equal(frenchTypography('arn:aws:s3:::bucket'), 'arn:aws:s3:::bucket');
  });
});
