import { Meteor } from 'meteor/meteor';
import emailTemplate from './emailTemplate';

// Sent from the domain the server runs on (ROOT_URL)
Accounts.emailTemplates.from = `no-reply@${new URL(Meteor.absoluteUrl()).hostname}`;
Accounts.emailTemplates.siteName = 'DiceCloud';

// Written in the account's interface language (preferences.language)
const EMAILS = {
  en: {
    enrollAccount: {
      subject: 'DiceCloud Invite',
      heading: 'DiceCloud Invite',
      text: 'You have been invited to DiceCloud, click the button below to begin.',
      buttonText: 'Get Started',
    },
    resetPassword: {
      subject: 'DiceCloud Password Reset',
      heading: 'Password Reset',
      text: 'If you did not request this password reset, please ignore this email.',
      buttonText: 'Reset Password',
    },
    verifyEmail: {
      subject: 'DiceCloud Email Verification',
      heading: 'DiceCloud Email Verification',
      text: 'Click below to verify your email address',
      buttonText: 'Verify Email',
    },
  },
  fr: {
    enrollAccount: {
      subject: 'Invitation à DiceCloud',
      heading: 'Invitation à DiceCloud',
      text: 'Vous avez été invité à rejoindre DiceCloud, cliquez sur le bouton ci-dessous pour commencer.',
      buttonText: 'Commencer',
    },
    resetPassword: {
      subject: 'Réinitialisation de votre mot de passe DiceCloud',
      heading: 'Réinitialisation du mot de passe',
      text: 'Si vous n\'avez pas demandé cette réinitialisation, ignorez cet e-mail.',
      buttonText: 'Réinitialiser le mot de passe',
    },
    verifyEmail: {
      subject: 'Vérification de votre adresse e-mail DiceCloud',
      heading: 'Vérification de l\'adresse e-mail',
      text: 'Cliquez ci-dessous pour vérifier votre adresse e-mail',
      buttonText: 'Vérifier l\'adresse e-mail',
    },
  },
};

function accountEmail(kind) {
  const texts = user => EMAILS[user?.preferences?.language]?.[kind] || EMAILS.en[kind];
  return {
    subject: user => texts(user).subject,
    html: (user, url) => emailTemplate({
      ...texts(user),
      url: url.replace('#/', ''),
    }),
  };
}

Accounts.emailTemplates.enrollAccount = accountEmail('enrollAccount');
Accounts.emailTemplates.resetPassword = accountEmail('resetPassword');
Accounts.emailTemplates.verifyEmail = accountEmail('verifyEmail');
