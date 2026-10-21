import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import '/imports/startup/server/accountsEmailConfig';

/*
 * The accounts' e-mails (invitation, password reset, address check): in the
 * account's interface language, English otherwise, with the link the button
 * opens, which the app routes without "#/".
 */
const url = 'https://dicecloud.example/#/reset-password/token123';
type Template = { subject: (user: object) => string, html: (user: object, url: string) => string };
const templates = Accounts.emailTemplates as unknown as Record<string, Template>;

if (Meteor.isServer) describe('Account e-mails', function () {
  it('are in the account\'s language, English otherwise', function () {
    assert.equal(templates.resetPassword.subject({ preferences: { language: 'fr' } }), 'Réinitialisation de votre mot de passe DiceCloud');
    for (const user of [{}, { preferences: { language: 'xx' } }]) {
      assert.equal(templates.resetPassword.subject(user), 'DiceCloud Password Reset');
    }
    const html = templates.verifyEmail.html({ preferences: { language: 'fr' } }, url);
    assert.include(html, 'Vérification de l\'adresse e-mail');
    assert.include(html, 'Vérifier l\'adresse e-mail');
  });

  it('link the button to the page, without "#/"', function () {
    for (const kind of ['enrollAccount', 'resetPassword', 'verifyEmail']) {
      const html = templates[kind].html({}, url);
      assert.include(html, 'href="https://dicecloud.example/reset-password/token123"', kind);
      assert.notInclude(html, '#/', kind);
    }
  });
});
