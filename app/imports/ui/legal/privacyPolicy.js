// The privacy policy, as markdown, in each interface language. Who runs the
// instance and how to reach them come from the settings (public.legal): see
// LegalPage.vue. Update LAST_UPDATED and both languages together.
const LAST_UPDATED = {
  en: 'October 5, 2026',
  fr: '5 octobre 2026',
};

const contactLink = (email, missing) => email ? `[${email}](mailto:${email})` : missing;

export default {
  en: ({ operator, contactEmail }) => {
    const contact = contactLink(contactEmail, 'the contact address of this instance');
    return `# Privacy policy

*Last updated: ${LAST_UPDATED.en}*

This page explains which personal data this DiceCloud instance processes, why, and what your rights are.

## Who is responsible for your data

This DiceCloud instance is run by **${operator || 'the administrator of this instance'}**, who is the controller of your data. For any question or request about your data, write to ${contact}.

DiceCloud is free software. This instance is independent of dicecloud.com and its authors.

## Data we process

- **Your account**: username, email address and whether it is verified, password (stored only as an irreversible hash, never in clear), creation date, role, preferences (language, theme, display options), library subscriptions, file storage used, and login tokens.
- **Sign-in with Google**, if you use it: your Google account identifier, email address, name and profile picture as Google sends them, and the access tokens Google provides. We ask for no access to your other Google data.
- **Your content**: your characters and their properties, their roll logs (the 100 most recent per character), experience, folders, tabletops and libraries.
- **Your files**: the images you upload and the archives of your characters.
- **Technical data**: the host keeps technical logs, including IP addresses, to run and secure the service.

We use no audience measurement, advertising or profiling tools, and we neither sell nor rent your data.

## Why, and on what legal basis

- **Providing the service**: creating and managing your account, saving and showing your content, sending the email address verification and password reset emails. This is necessary to perform the [terms of use](/terms) you accept (GDPR article 6.1.b).
- **Securing the service and preventing abuse**: request rate limits and technical logs. This is our legitimate interest (GDPR article 6.1.f).

## Who can see your data

- **Other users** see what you share: your username is shown to the people you share a character or a library with, and anyone with its link can view a character or library you make public.
- **Our providers**, who process the data on our behalf only:
  - Meteor Software (Galaxy), which hosts the application;
  - MongoDB (Atlas), which hosts the database;
  - Amazon Web Services (S3), which stores the files, in Paris (France);
  - the provider that sends the service's emails;
  - Google, only if you sign in with Google.
- **Discord**, only if you set a Discord webhook on a character: that character's log entries are then sent there.
- **Other websites**: some library images are hosted on other sites. Your browser downloads them directly from those sites, which then see your IP address.

Some of these providers are based outside the European Union, notably in the United States. Those transfers are covered by the safeguards the GDPR provides for: an adequacy decision or the European Commission's standard contractual clauses.

## How long we keep it

- Your account and your content are kept for as long as your account exists.
- Character properties and library entries you delete can be restored for about a day, then are erased for good.
- Only the 100 most recent roll logs of each character are kept.
- Deleting your account (on the Account page) immediately erases your account, characters, libraries, folders, images and archives.
- The host keeps its technical logs for a limited time.

## Cookies and browser storage

The application sets no advertising or audience measurement cookies. It keeps your login token (so that you stay signed in) and your choice of language in your browser's local storage. These are strictly necessary for the service to work, so they do not require your consent.

## Security

Connections are encrypted (HTTPS), passwords are never stored in clear, and files are kept in private storage that is only reachable through the application.

## Your rights

You can at any time access your data, correct it, have it erased, restrict or object to its processing, and receive a copy of it (portability). You can change most of it on the Account page, download any of your characters as a file from its sheet's menu, and delete your account yourself. For anything else, write to ${contact}. If you believe your rights are not respected, you can lodge a complaint with the CNIL ([www.cnil.fr](https://www.cnil.fr)).

## Changes

This policy may change. The date at the top of the page shows its last update. `;
  },

  fr: ({ operator, contactEmail }) => {
    const contact = contactLink(contactEmail, 'l\'adresse de contact de cette instance');
    return `# Règles de confidentialité

*Dernière mise à jour : ${LAST_UPDATED.fr}*

Cette page explique quelles données personnelles cette instance de DiceCloud traite, pourquoi, et quels sont vos droits.

## Qui est responsable de vos données

Cette instance de DiceCloud est exploitée par **${operator || 'l\'administrateur de cette instance'}**, responsable du traitement de vos données. Pour toute question ou demande concernant vos données, écrivez à ${contact}.

DiceCloud est un logiciel libre. Cette instance est indépendante du site dicecloud.com et de ses auteurs.

## Données que nous traitons

- **Votre compte** : nom d'utilisateur, adresse e-mail et si elle est vérifiée, mot de passe (conservé uniquement sous une forme chiffrée irréversible, jamais en clair), date de création, rôle, préférences (langue, thème, options d'affichage), abonnements aux bibliothèques, espace de stockage utilisé, et jetons de connexion.
- **Connexion avec Google**, si vous l'utilisez : l'identifiant de votre compte Google, votre adresse e-mail, votre nom et votre photo de profil tels que Google nous les transmet, ainsi que les jetons d'accès fournis par Google. Nous ne demandons l'accès à aucune autre de vos données Google.
- **Votre contenu** : vos personnages et leurs propriétés, leurs journaux de jets (les 100 plus récents par personnage), leur expérience, vos dossiers, tables de jeu et bibliothèques.
- **Vos fichiers** : les images que vous envoyez et les archives de vos personnages.
- **Données techniques** : l'hébergeur conserve des journaux techniques, dont les adresses IP, pour faire fonctionner et sécuriser le service.

Nous n'utilisons aucun outil de mesure d'audience, de publicité ou de profilage, et nous ne vendons ni ne louons vos données.

## Pourquoi, et sur quelle base légale

- **Fournir le service** : créer et gérer votre compte, enregistrer et afficher votre contenu, envoyer les e-mails de vérification d'adresse et de réinitialisation du mot de passe. C'est nécessaire à l'exécution des [conditions d'utilisation](/terms) que vous acceptez (article 6.1.b du RGPD).
- **Sécuriser le service et prévenir les abus** : limitation du nombre de requêtes et journaux techniques. C'est notre intérêt légitime (article 6.1.f du RGPD).

## Qui peut voir vos données

- **Les autres utilisateurs** voient ce que vous partagez : votre nom d'utilisateur apparaît auprès des personnes avec qui vous partagez un personnage ou une bibliothèque, et toute personne qui en a le lien peut consulter un personnage ou une bibliothèque que vous rendez public.
- **Nos prestataires**, qui traitent les données pour notre compte uniquement :
  - Meteor Software (Galaxy), qui héberge l'application ;
  - MongoDB (Atlas), qui héberge la base de données ;
  - Amazon Web Services (S3), qui stocke les fichiers, à Paris (France) ;
  - le prestataire qui envoie les e-mails du service ;
  - Google, uniquement si vous vous connectez avec Google.
- **Discord**, uniquement si vous renseignez un webhook Discord sur un personnage : les entrées de son journal y sont alors envoyées.
- **D'autres sites** : certaines images des bibliothèques sont hébergées sur d'autres sites. Votre navigateur les télécharge directement auprès de ces sites, qui voient alors votre adresse IP.

Certains de ces prestataires sont établis hors de l'Union européenne, notamment aux États-Unis. Ces transferts sont encadrés par les garanties prévues par le RGPD : une décision d'adéquation ou les clauses contractuelles types de la Commission européenne.

## Combien de temps nous les conservons

- Votre compte et votre contenu sont conservés tant que votre compte existe.
- Les propriétés de personnage et les entrées de bibliothèque que vous supprimez restent restaurables environ un jour, puis sont effacées définitivement.
- Seuls les 100 journaux de jets les plus récents de chaque personnage sont conservés.
- Supprimer votre compte (page Compte) efface immédiatement votre compte, vos personnages, vos bibliothèques, vos dossiers, vos images et vos archives.
- L'hébergeur conserve ses journaux techniques pendant une durée limitée.

## Cookies et stockage dans votre navigateur

L'application ne dépose aucun cookie publicitaire ou de mesure d'audience. Elle enregistre dans le stockage local de votre navigateur votre jeton de connexion (pour que vous restiez connecté) et votre choix de langue. Ces éléments sont strictement nécessaires au fonctionnement du service et ne requièrent donc pas votre consentement.

## Sécurité

Les échanges sont chiffrés (HTTPS), les mots de passe ne sont jamais stockés en clair, et les fichiers sont conservés dans un espace privé accessible uniquement au travers de l'application.

## Vos droits

Vous pouvez à tout moment accéder à vos données, les rectifier, les faire effacer, en limiter le traitement ou vous y opposer, et en recevoir une copie (portabilité). Vous pouvez modifier la plupart d'entre elles depuis la page Compte, télécharger chacun de vos personnages sous forme de fichier depuis le menu de sa fiche, et supprimer votre compte vous-même. Pour toute autre demande, écrivez à ${contact}. Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL ([www.cnil.fr](https://www.cnil.fr)).

## Modifications

Ces règles peuvent évoluer. La date en haut de la page indique leur dernière mise à jour. `;
  },
};
