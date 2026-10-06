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

This DiceCloud instance is run by **${operator || 'the administrator of this instance'}**, who is the controller of your data. For any question or request about your data, write to ${contact}. This instance is independent of dicecloud.com.

Your data is kept on a server the controller operates in France, and the files you upload are stored by Amazon Web Services (S3) in Paris.

## Data we process

- **Your account**: username, email address, password (stored only as an irreversible hash), role, preferences, library subscriptions and login tokens.
- **Sign-in with Google**, if you use it: your Google identifier, email address, name and profile picture, and the tokens Google provides; nothing else from your Google account.
- **Your content**: your characters and their logs, your folders and party boards, your libraries, and the Discord webhook address you may set on a character.
- **Your files**: the images you upload and the archives of your characters.
- **Technical data**: IP addresses and technical logs, processed by the server and by Cloudflare.

We use no audience measurement, advertising or profiling tools, and we neither sell nor rent your data.

## Why, and on what legal basis

- **Providing the service** (your account, your content, sharing, party boards, verification and password reset emails, posting to Discord when you ask for it): this is necessary to perform the [terms of use](/terms) you accept (GDPR article 6.1.b).
- **Securing the service** (request rate limits, technical logs, backups): this is our legitimate interest (GDPR article 6.1.f).

## Who can see your data

- **Other users**: the people you share a character or a library with see your username, and anyone with its link can view a character or a library you make public. On a party board, the game master can view and modify the characters you bring for as long as they stay on it, and the members see each other's usernames and characters.
- **Our providers**, on our behalf only: Cloudflare, through which every connection to the service goes; Amazon Web Services (S3), which stores the files; Brevo, which sends the emails; Google, only if you sign in with Google.
- **Discord**, only if you set a webhook on a character: that character's log, name and picture are posted to the Discord channel you chose, under Discord's privacy policy. The Discord page also shows a widget of the community's server, which Discord serves directly.
- **Other websites** that host some library images: your browser downloads them directly, so those sites see your IP address.

Some of these providers are based outside the European Union, notably in the United States. Those transfers are covered by the safeguards the GDPR provides for: an adequacy decision or the European Commission's standard contractual clauses.

## How long we keep it

- Your account and your content are kept for as long as your account exists.
- What you delete in a character or a library can be restored for about a day, then is erased for good.
- Each character's log keeps its 100 most recent entries.
- Deleting your account (on the Account page) immediately erases all your data and removes you from what was shared with you and from the party boards you joined.
- Backups are kept for 7 days, so data you delete disappears from them within that time.
- Technical logs are erased as they go. Cloudflare keeps its own under its policy.

## Cookies and browser storage

The application sets no advertising or audience measurement cookies. Your browser's local storage keeps your login token, your language and how you display your character list: they are needed for the service to work or only remember your choices, so they do not require your consent.

## Security

Connections are encrypted (HTTPS), passwords are never stored in clear, and files are kept in private storage that only the application can reach.

## Your rights

You can at any time access your data, correct it, have it erased, restrict or object to its processing, and receive a copy of it (portability). You can change most of it on the Account page, download any of your characters from its sheet's menu, and delete your account yourself. For anything else, write to ${contact}. If you believe your rights are not respected, you can lodge a complaint with the CNIL ([www.cnil.fr](https://www.cnil.fr)).

## Changes

This policy may change. The date at the top of the page shows its last update. `;
  },

  fr: ({ operator, contactEmail }) => {
    const contact = contactLink(contactEmail, 'l\'adresse de contact de cette instance');
    return frenchTypography(`# Règles de confidentialité

*Dernière mise à jour : ${LAST_UPDATED.fr}*

Cette page explique quelles données personnelles cette instance de DiceCloud traite, pourquoi, et quels sont vos droits.

## Qui est responsable de vos données

Cette instance de DiceCloud est exploitée par **${operator || 'l\'administrateur de cette instance'}**, responsable du traitement de vos données. Pour toute question ou demande concernant vos données, écrivez à ${contact}. Cette instance est indépendante du site dicecloud.com.

Vos données sont conservées sur un serveur que le responsable du traitement exploite en France, et les fichiers que vous envoyez sont stockés par Amazon Web Services (S3), à Paris.

## Données que nous traitons

- **Votre compte** : nom d'utilisateur, adresse e-mail, mot de passe (conservé uniquement sous une forme chiffrée irréversible), rôle, préférences, abonnements aux bibliothèques et jetons de connexion.
- **Connexion avec Google**, si vous l'utilisez : votre identifiant Google, votre adresse e-mail, votre nom et votre photo de profil, ainsi que les jetons fournis par Google ; rien d'autre de votre compte Google.
- **Votre contenu** : vos personnages et leurs journaux, vos dossiers et tableaux de groupe, vos bibliothèques, et l'adresse du webhook Discord que vous pouvez renseigner sur un personnage.
- **Vos fichiers** : les images que vous envoyez et les archives de vos personnages.
- **Données techniques** : adresses IP et journaux techniques, traités par le serveur et par Cloudflare.

Nous n'utilisons aucun outil de mesure d'audience, de publicité ou de profilage, et nous ne vendons ni ne louons vos données.

## Pourquoi, et sur quelle base légale

- **Fournir le service** (votre compte, votre contenu, le partage, les tableaux de groupe, les e-mails de vérification et de réinitialisation du mot de passe, la publication sur Discord quand vous la demandez) : c'est nécessaire à l'exécution des [conditions d'utilisation](/terms) que vous acceptez (article 6.1.b du RGPD).
- **Sécuriser le service** (limitation du nombre de requêtes, journaux techniques, sauvegardes) : c'est notre intérêt légitime (article 6.1.f du RGPD).

## Qui peut voir vos données

- **Les autres utilisateurs** : les personnes avec qui vous partagez un personnage ou une bibliothèque voient votre nom d'utilisateur, et toute personne qui en a le lien peut consulter un personnage ou une bibliothèque que vous rendez public. Sur un tableau de groupe, le meneur de jeu peut consulter et modifier les personnages que vous y amenez tant qu'ils y restent, et les membres voient les noms d'utilisateur et les personnages les uns des autres.
- **Nos prestataires**, pour notre compte uniquement : Cloudflare, par qui passent toutes les connexions au service ; Amazon Web Services (S3), qui stocke les fichiers ; Brevo, qui envoie les e-mails ; Google, uniquement si vous vous connectez avec Google.
- **Discord**, uniquement si vous renseignez un webhook sur un personnage : le journal de ce personnage, son nom et son image sont publiés sur le salon Discord choisi, selon les règles de confidentialité de Discord. La page Discord affiche aussi un module du serveur de la communauté, que Discord fournit directement.
- **D'autres sites**, qui hébergent certaines images des bibliothèques : votre navigateur les télécharge directement, et ces sites voient donc votre adresse IP.

Certains de ces prestataires sont établis hors de l'Union européenne, notamment aux États-Unis. Ces transferts sont encadrés par les garanties prévues par le RGPD : une décision d'adéquation ou les clauses contractuelles types de la Commission européenne.

## Combien de temps nous les conservons

- Votre compte et votre contenu sont conservés tant que votre compte existe.
- Ce que vous supprimez dans un personnage ou une bibliothèque reste restaurable environ un jour, puis est effacé définitivement.
- Le journal de chaque personnage garde ses 100 entrées les plus récentes.
- Supprimer votre compte (page Compte) efface immédiatement toutes vos données et vous retire de ce qui était partagé avec vous et des tableaux de groupe que vous avez rejoints.
- Les sauvegardes sont conservées 7 jours : les données que vous supprimez en disparaissent dans ce délai.
- Les journaux techniques sont effacés au fur et à mesure. Cloudflare conserve les siens selon ses règles.

## Cookies et stockage dans votre navigateur

L'application ne dépose aucun cookie publicitaire ou de mesure d'audience. Le stockage local de votre navigateur garde votre jeton de connexion, votre langue et l'affichage de votre liste de personnages : ces éléments sont nécessaires au service ou mémorisent vos choix, et ne requièrent donc pas votre consentement.

## Sécurité

Les échanges sont chiffrés (HTTPS), les mots de passe ne sont jamais stockés en clair, et les fichiers sont conservés dans un espace privé que seule l'application peut atteindre.

## Vos droits

Vous pouvez à tout moment accéder à vos données, les rectifier, les faire effacer, en limiter le traitement ou vous y opposer, et en recevoir une copie (portabilité). Vous pouvez modifier la plupart d'entre elles depuis la page Compte, télécharger chacun de vos personnages depuis le menu de sa fiche, et supprimer votre compte vous-même. Pour toute autre demande, écrivez à ${contact}. Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL ([www.cnil.fr](https://www.cnil.fr)).

## Modifications

Ces règles peuvent évoluer. La date en haut de la page indique leur dernière mise à jour. `);
  },
};
