// The terms of use, as markdown, in each interface language. Who runs the
// instance and how to reach them come from the settings (public.legal): see
// LegalPage.vue. Update LAST_UPDATED and both languages together.
const LAST_UPDATED = {
  en: 'September 29, 2026',
  fr: '29 septembre 2026',
};

const contactLink = (email, missing) => email ? `[${email}](mailto:${email})` : missing;

export default {
  en: ({ operator, contactEmail }) => {
    const contact = contactLink(contactEmail, 'the contact address of this instance');
    return `# Terms of use

*Last updated: ${LAST_UPDATED.en}*

## 1. Purpose

These terms govern the use of this DiceCloud instance ("the service"), run by **${operator || 'the administrator of this instance'}**. DiceCloud is free software (GPL-3.0 licence) providing character sheets and tools for tabletop role-playing games. This instance is independent of dicecloud.com. By creating an account or using the service, you accept these terms.

## 2. Access to the service

The service is free. It is provided as is, with no guarantee of availability: it may be interrupted, notably for maintenance, changed or discontinued. We do not guarantee that your data will be kept: keep your own copies of what matters to you, for example the archives of your characters.

You must be at least 15 years old, or have the consent of a parent or guardian.

## 3. Your account

Give accurate information when you register. You are responsible for keeping your password confidential and for what is done with your account; tell us at once if you notice any unauthorised use. Roles (player, active player, administrator) set limits, such as the number of characters, file storage and library creation, shown on the Account page.

## 4. Your content

You keep ownership of the content you create or upload. You grant us the right to host, copy and display it as far as needed to run the service, including to the people you share it with or, if you make it public, to anyone. That right ends when you delete the content or your account.

You confirm that you hold the rights needed for what you upload (texts, images) and that it breaks neither the law nor the rights of others.

## 5. Other people's content

The libraries shared by the community are the work of their authors, who keep their rights to them. Dungeons & Dragons is a trademark of Wizards of the Coast; this service is neither affiliated with nor endorsed by Wizards of the Coast. Report any unlawful content to ${contact}: we will remove it where appropriate.

## 6. Forbidden uses

- publishing unlawful, hateful or harassing content, or content that infringes the rights of others;
- trying to access other people's accounts or data, or to get around the service's limits and protections;
- overloading the service, notably with large volumes of automated requests;
- using the service to send spam or malware.

## 7. Suspension and deletion

You can delete your account at any time on the Account page. We may suspend or delete an account that breaks these terms, after warning you unless there is an emergency or a legal obligation.

## 8. Liability

As far as the law allows, we are not liable for data loss, interruptions of the service, or indirect damage arising from its use. Nothing in these terms limits the rights the law gives you, notably as a consumer.

## 9. Personal data

How we process your personal data is described in the [privacy policy](/privacy).

## 10. Changes

These terms may change. The date at the top of the page shows their last update. By continuing to use the service after a change, you accept the new terms.

## 11. Applicable law

These terms are governed by French law. In case of dispute, and after an attempt to settle it amicably, the French courts have jurisdiction.

For any question, write to ${contact}. `;
  },

  fr: ({ operator, contactEmail }) => {
    const contact = contactLink(contactEmail, 'l\'adresse de contact de cette instance');
    return `# Conditions d'utilisation

*Dernière mise à jour : ${LAST_UPDATED.fr}*

## 1. Objet

Ces conditions encadrent l'utilisation de cette instance de DiceCloud (« le service »), exploitée par **${operator || 'l\'administrateur de cette instance'}**. DiceCloud est un logiciel libre (licence GPL-3.0) de feuilles de personnage et d'outils pour les jeux de rôle sur table. Cette instance est indépendante du site dicecloud.com. En créant un compte ou en utilisant le service, vous acceptez ces conditions.

## 2. Accès au service

Le service est gratuit. Il est fourni en l'état, sans garantie de disponibilité : il peut être interrompu, notamment pour maintenance, modifié ou arrêté. Nous ne garantissons pas la conservation de vos données : gardez vos propres copies de ce qui compte pour vous, par exemple les archives de vos personnages.

Vous devez avoir au moins 15 ans, ou l'accord d'un parent ou d'un tuteur.

## 3. Votre compte

Donnez des informations exactes lors de votre inscription. Vous êtes responsable de la confidentialité de votre mot de passe et de ce qui est fait avec votre compte ; prévenez-nous sans attendre si vous constatez une utilisation non autorisée. Les rôles (joueur, joueur actif, administrateur) fixent des limites, comme le nombre de personnages, l'espace de stockage des fichiers et la création de bibliothèques, indiquées sur la page Compte.

## 4. Votre contenu

Vous restez propriétaire du contenu que vous créez ou envoyez. Vous nous accordez le droit de l'héberger, de le reproduire et de l'afficher dans la mesure nécessaire au fonctionnement du service, y compris auprès des personnes avec qui vous le partagez ou, si vous le rendez public, auprès de tous. Ce droit prend fin lorsque vous supprimez ce contenu ou votre compte.

Vous garantissez disposer des droits nécessaires sur ce que vous envoyez (textes, images) et que cela ne contrevient ni à la loi ni aux droits d'autrui.

## 5. Contenu d'autres personnes

Les bibliothèques partagées par la communauté sont l'œuvre de leurs auteurs, qui en conservent les droits. Dungeons & Dragons est une marque de Wizards of the Coast ; ce service n'est ni affilié à Wizards of the Coast, ni approuvé par elle. Signalez tout contenu illicite à ${contact} : nous le retirerons s'il y a lieu.

## 6. Usages interdits

- publier un contenu illicite, haineux ou harcelant, ou qui porte atteinte aux droits d'autrui ;
- tenter d'accéder aux comptes ou aux données d'autrui, ou de contourner les limites et les protections du service ;
- surcharger le service, notamment par un grand volume de requêtes automatisées ;
- utiliser le service pour envoyer du spam ou des logiciels malveillants.

## 7. Suspension et suppression

Vous pouvez supprimer votre compte à tout moment depuis la page Compte. Nous pouvons suspendre ou supprimer un compte qui enfreint ces conditions, après vous avoir prévenu, sauf urgence ou obligation légale.

## 8. Responsabilité

Dans les limites permises par la loi, nous ne sommes pas responsables des pertes de données, des interruptions du service, ni des dommages indirects liés à son utilisation. Rien dans ces conditions ne limite les droits que la loi vous accorde, notamment en tant que consommateur.

## 9. Données personnelles

Le traitement de vos données personnelles est décrit dans les [règles de confidentialité](/privacy).

## 10. Modifications

Ces conditions peuvent évoluer. La date en haut de la page indique leur dernière mise à jour. En continuant d'utiliser le service après une modification, vous acceptez les nouvelles conditions.

## 11. Droit applicable

Ces conditions sont régies par le droit français. En cas de litige, et après une tentative de règlement amiable, les tribunaux français sont compétents.

Pour toute question, écrivez à ${contact}. `;
  },
};
