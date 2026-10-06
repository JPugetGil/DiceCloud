// The privacy policy, as markdown, in each interface language. Who runs the
// instance and how to reach them come from the settings (public.legal): see
// LegalPage.vue. Update LAST_UPDATED and both languages together.
import frenchTypography from '/imports/ui/i18n/frenchTypography';

const LAST_UPDATED = {
  en: 'October 6, 2026',
  fr: '6 octobre 2026',
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

## Where your data is kept

The application and its database run on a server that the controller operates in France. The files you upload are stored by Amazon Web Services (S3) in Paris (France). The database is not reachable from the internet: only the application can read it.

## Data we process

- **Your account**: username, email address and whether it is verified, password (stored only as an irreversible hash, never in clear), creation date, role, preferences (language, theme, units of measurement, animations, display options), library subscriptions, file storage used, and login tokens.
- **Sign-in with Google**, if you use it: your Google account identifier, email address, name and profile picture as Google sends them, and the access tokens Google provides. We ask for no access to your other Google data.
- **Your content**: your characters and their properties, their logs of rolls and actions (the 100 most recent per character), experience, folders, party boards (their members and initiative tracker), libraries, and the Discord webhook address you may set on a character.
- **Your files**: the images you upload and the archives of your characters.
- **Technical data**: the server and Cloudflare, which publishes the service, process IP addresses and keep technical logs to run and secure the service.

We use no audience measurement, advertising or profiling tools, and we neither sell nor rent your data.

## Why, and on what legal basis

- **Providing the service**: creating and managing your account, saving and showing your content, sharing it and running party boards, sending the email address verification and password reset emails, and posting a character's log to Discord when you set a webhook on it. This is necessary to perform the [terms of use](/terms) you accept (GDPR article 6.1.b).
- **Securing the service and preventing abuse**: request rate limits, technical logs and database backups. This is our legitimate interest (GDPR article 6.1.f).

## Who can see your data

- **Other users** see what you share:
  - your username is shown to the people you share a character or a library with;
  - anyone with its link can view a character or a library you make public, including through the application's programming interface (API);
  - when you join a party board with characters, its game master can view and modify those characters for as long as they stay on the board, and the other members see their name, hit points, conditions and turn; the members of a board see each other's usernames.
- **Our providers**, who process the data on our behalf only:
  - Cloudflare, which publishes the service on the internet: every connection goes through its network, which handles their encryption (HTTPS);
  - Amazon Web Services (S3), which stores the files, in Paris (France);
  - Brevo, which sends the service's emails;
  - Google, only if you sign in with Google.
- **Services your browser contacts directly**, which see your IP address and the kind of browser you use (the fonts and icons are served by the application itself):
  - Discord, on the Discord page, which shows a widget of the community's Discord server;
  - other websites that host some library images.
- **Discord**, only if you set a Discord webhook on a character: that character's log entries (rolls, actions, rests and their results), its name, its picture and a link to its sheet are then posted to that Discord channel, under Discord's own privacy policy. Lines hidden in the application are not sent, and only the people who can edit the character can see the webhook's address.

Some of these providers are based outside the European Union, notably in the United States. Those transfers are covered by the safeguards the GDPR provides for: an adequacy decision or the European Commission's standard contractual clauses.

## How long we keep it

- Your account and your content are kept for as long as your account exists.
- Character properties and library entries you delete can be restored for about a day, then are erased for good.
- Only the 100 most recent log entries of each character are kept.
- Deleting your account (on the Account page) immediately erases your account, characters, libraries, library collections, folders, images and archives. It also removes you from the characters, libraries and collections shared with you and from the party boards you joined, and takes your characters off every board and initiative tracker.
- The database is backed up every day, and each backup is kept for 7 days: data you delete disappears from the backups within that time.
- The server's technical logs are rotated once they reach a few tens of megabytes. Cloudflare keeps its own logs under its policy.

## Cookies and browser storage

The application sets no advertising or audience measurement cookies. It keeps in your browser's local storage your login token (so that you stay signed in), your choice of language and how you display your character list. They are either strictly necessary for the service to work or only remember choices you made, so they do not require your consent.

## Security

Connections are encrypted (HTTPS) up to Cloudflare, then through an encrypted tunnel up to the server. Passwords are never stored in clear, files are kept in private storage that is only reachable through the application, and the database is backed up every day.

## Your rights

You can at any time access your data, correct it, have it erased, restrict or object to its processing, and receive a copy of it (portability). You can change most of it on the Account page, download any of your characters as a file from its sheet's menu, and delete your account yourself. For anything else, write to ${contact}. If you believe your rights are not respected, you can lodge a complaint with the CNIL ([www.cnil.fr](https://www.cnil.fr)).

## Changes

This policy may change. The date at the top of the page shows its last update. `;
  },

  fr: ({ operator, contactEmail }) => {
    const contact = contactLink(contactEmail, 'l\'adresse de contact de cette instance');
    return frenchTypography(`# Règles de confidentialité

*Dernière mise à jour : ${LAST_UPDATED.fr}*

Cette page explique quelles données personnelles cette instance de DiceCloud traite, pourquoi, et quels sont vos droits.

## Qui est responsable de vos données

Cette instance de DiceCloud est exploitée par **${operator || 'l\'administrateur de cette instance'}**, responsable du traitement de vos données. Pour toute question ou demande concernant vos données, écrivez à ${contact}.

DiceCloud est un logiciel libre. Cette instance est indépendante du site dicecloud.com et de ses auteurs.

## Où sont conservées vos données

L'application et sa base de données fonctionnent sur un serveur que le responsable du traitement exploite en France. Les fichiers que vous envoyez sont stockés par Amazon Web Services (S3), à Paris (France). La base de données n'est pas accessible depuis Internet : seule l'application peut la lire.

## Données que nous traitons

- **Votre compte** : nom d'utilisateur, adresse e-mail et si elle est vérifiée, mot de passe (conservé uniquement sous une forme chiffrée irréversible, jamais en clair), date de création, rôle, préférences (langue, thème, unités de mesure, animations, options d'affichage), abonnements aux bibliothèques, espace de stockage utilisé, et jetons de connexion.
- **Connexion avec Google**, si vous l'utilisez : l'identifiant de votre compte Google, votre adresse e-mail, votre nom et votre photo de profil tels que Google nous les transmet, ainsi que les jetons d'accès fournis par Google. Nous ne demandons l'accès à aucune autre de vos données Google.
- **Votre contenu** : vos personnages et leurs propriétés, leurs journaux de jets et d'actions (les 100 plus récents par personnage), leur expérience, vos dossiers, vos tableaux de groupe (leurs membres et leur suivi d'initiative), vos bibliothèques, et l'adresse du webhook Discord que vous pouvez renseigner sur un personnage.
- **Vos fichiers** : les images que vous envoyez et les archives de vos personnages.
- **Données techniques** : le serveur et Cloudflare, qui publie le service, traitent les adresses IP et conservent des journaux techniques pour faire fonctionner et sécuriser le service.

Nous n'utilisons aucun outil de mesure d'audience, de publicité ou de profilage, et nous ne vendons ni ne louons vos données.

## Pourquoi, et sur quelle base légale

- **Fournir le service** : créer et gérer votre compte, enregistrer et afficher votre contenu, le partager et faire fonctionner les tableaux de groupe, envoyer les e-mails de vérification d'adresse et de réinitialisation du mot de passe, et publier le journal d'un personnage sur Discord quand vous y renseignez un webhook. C'est nécessaire à l'exécution des [conditions d'utilisation](/terms) que vous acceptez (article 6.1.b du RGPD).
- **Sécuriser le service et prévenir les abus** : limitation du nombre de requêtes, journaux techniques et sauvegardes de la base de données. C'est notre intérêt légitime (article 6.1.f du RGPD).

## Qui peut voir vos données

- **Les autres utilisateurs** voient ce que vous partagez :
  - votre nom d'utilisateur apparaît auprès des personnes avec qui vous partagez un personnage ou une bibliothèque ;
  - toute personne qui en a le lien peut consulter un personnage ou une bibliothèque que vous rendez public, y compris par l'interface de programmation (API) de l'application ;
  - quand vous rejoignez un tableau de groupe avec des personnages, son meneur de jeu peut consulter et modifier ces personnages tant qu'ils restent sur le tableau, et les autres membres voient leur nom, leurs points de vie, leurs états et leur tour ; les membres d'un tableau voient les noms d'utilisateur les uns des autres.
- **Nos prestataires**, qui traitent les données pour notre compte uniquement :
  - Cloudflare, qui publie le service sur Internet : toutes les connexions passent par son réseau, qui en assure le chiffrement (HTTPS) ;
  - Amazon Web Services (S3), qui stocke les fichiers, à Paris (France) ;
  - Brevo, qui envoie les e-mails du service ;
  - Google, uniquement si vous vous connectez avec Google.
- **Les services que votre navigateur contacte directement**, qui voient votre adresse IP et le type de navigateur que vous utilisez (les polices et les icônes sont servies par l'application elle-même) :
  - Discord, sur la page Discord, qui affiche un module du serveur Discord de la communauté ;
  - d'autres sites qui hébergent certaines images des bibliothèques.
- **Discord**, uniquement si vous renseignez un webhook Discord sur un personnage : les entrées de son journal (jets, actions, repos et leurs résultats), son nom, son image et un lien vers sa fiche sont alors publiés sur ce salon Discord, selon les règles de confidentialité de Discord. Les lignes masquées dans l'application ne sont pas envoyées, et seules les personnes qui peuvent modifier le personnage voient l'adresse du webhook.

Certains de ces prestataires sont établis hors de l'Union européenne, notamment aux États-Unis. Ces transferts sont encadrés par les garanties prévues par le RGPD : une décision d'adéquation ou les clauses contractuelles types de la Commission européenne.

## Combien de temps nous les conservons

- Votre compte et votre contenu sont conservés tant que votre compte existe.
- Les propriétés de personnage et les entrées de bibliothèque que vous supprimez restent restaurables environ un jour, puis sont effacées définitivement.
- Seules les 100 entrées les plus récentes du journal de chaque personnage sont conservées.
- Supprimer votre compte (page Compte) efface immédiatement votre compte, vos personnages, vos bibliothèques, vos collections de bibliothèques, vos dossiers, vos images et vos archives. Il vous retire aussi des personnages, des bibliothèques et des collections partagés avec vous et des tableaux de groupe que vous avez rejoints, et retire vos personnages de tous les tableaux et suivis d'initiative.
- La base de données est sauvegardée chaque jour, et chaque sauvegarde est conservée 7 jours : les données que vous supprimez disparaissent des sauvegardes dans ce délai.
- Les journaux techniques du serveur sont renouvelés dès qu'ils atteignent quelques dizaines de mégaoctets. Cloudflare conserve ses propres journaux selon ses règles.

## Cookies et stockage dans votre navigateur

L'application ne dépose aucun cookie publicitaire ou de mesure d'audience. Elle enregistre dans le stockage local de votre navigateur votre jeton de connexion (pour que vous restiez connecté), votre choix de langue et l'affichage de votre liste de personnages. Ces éléments sont soit strictement nécessaires au fonctionnement du service, soit limités à mémoriser vos choix, et ne requièrent donc pas votre consentement.

## Sécurité

Les échanges sont chiffrés (HTTPS) jusqu'à Cloudflare, puis par un tunnel chiffré jusqu'au serveur. Les mots de passe ne sont jamais stockés en clair, les fichiers sont conservés dans un espace privé accessible uniquement au travers de l'application, et la base de données est sauvegardée chaque jour.

## Vos droits

Vous pouvez à tout moment accéder à vos données, les rectifier, les faire effacer, en limiter le traitement ou vous y opposer, et en recevoir une copie (portabilité). Vous pouvez modifier la plupart d'entre elles depuis la page Compte, télécharger chacun de vos personnages sous forme de fichier depuis le menu de sa fiche, et supprimer votre compte vous-même. Pour toute autre demande, écrivez à ${contact}. Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL ([www.cnil.fr](https://www.cnil.fr)).

## Modifications

Ces règles peuvent évoluer. La date en haut de la page indique leur dernière mise à jour. `);
  },
};
