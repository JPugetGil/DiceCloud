// The privacy policy, as markdown, in each interface language. Who runs the
// instance and how to reach them come from the settings (public.legal): see
// LegalPage.vue. Update LAST_UPDATED and both languages together.
import frenchTypography from '/imports/ui/i18n/frenchTypography';

const LAST_UPDATED = {
  en: 'October 17, 2026',
  fr: '17 octobre 2026',
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
- **Your Discord account**, if you link it: its identifier and its name, to mention you on your character's turn and to let you sign in with Discord; nothing else. DiceCloud keeps no Discord token: the authorization you give it stays in your Discord account, which lets you sign in with one click, until you remove DiceCloud from Authorized Apps in Discord's settings.
- **Discord channels**, if you connect a character or a party board to one: the identifiers of the Discord server and channel, and the webhook DiceCloud's application receives there, which only the server keeps, encrypted. The access Discord grants with it is discarded at once.
- **DiceCloud's commands on Discord**, if you use them: what you ask (the roll, the check, the hit points changed, the action or spell used), which goes to your character's log as from the sheet; your Discord user identifier and the identifiers of the server and channel it comes from, to answer there, not kept; the character you choose for each server with /character, until you choose another, unlink your Discord account or delete yours; while you answer the menus of /action, the action and what you choose in them (its targets, the spell slot, the ammunition, its choices), 15 minutes at most; for 30 days, the targets you last chose for each action with /action, which its menu then offers first; and, for 30 days, what a "Reroll" button rolls again (under a command's roll, or under a check or a saving throw posted to a connected channel).
- **Your content**: your characters and their logs, your folders and party boards, your libraries, and the Discord webhook addresses you may set on a character or, as a game master, on a party board (kept encrypted on the server, and shown to nobody, you included), with the Discord sessions you open there (the identifiers of a forum post, of a thread or of a message, and the date) and the last ten of them, to resume one (the identifiers and names of their threads, their channels, and their dates).
- **Your files**: the images you upload and the archives of your characters.
- **Technical data**: IP addresses and technical logs, processed by the server and by Cloudflare.

We use no audience measurement, advertising or profiling tools, and we neither sell nor rent your data.

## Why, and on what legal basis

- **Providing the service** (your account, your content, sharing, party boards, verification and password reset emails, posting to Discord when you ask for it): this is necessary to perform the [terms of use](/terms) you accept (GDPR article 6.1.b).
- **Securing the service** (request rate limits, technical logs, backups): this is our legitimate interest (GDPR article 6.1.f).

## Who can see your data

- **Other users**: the people you share a character or a library with see your username, and anyone with its link can view a character or a library you make public. On a party board, the game master can view and modify the characters you bring for as long as they stay on it, and the members see each other's usernames and characters.
- **Our providers**, on our behalf only: Cloudflare, through which every connection to the service goes; Amazon Web Services (S3), which stores the files; Brevo, which sends the emails; Google, only if you sign in with Google.
- **Discord**, only if a webhook is set or a channel connected: on a character, its log, name and picture are posted to the Discord channel chosen, under Discord's privacy policy; on a party board, by its game master, the party's fights (names, initiative order and conditions, never a monster's hit points) and the log, name and picture of the characters its players bring are posted to the party's channel. The party board and its invitation tell the players when a party does so. A player who linked their Discord account is mentioned on their character's turn, unless they turn it off in their account's settings. Linking your Discord account or signing in with it goes through Discord's own authorization page. The answer to a DiceCloud command goes to the channel it was run in, for you alone when it is secret, and never shows a monster's statistics to anyone but its game master. DiceCloud's bot, once a server's administrator adds it, only creates the thread of a session in the text channel a party's or a character's webhook posts in, and DiceCloud's webhook where /connect is run by someone allowed to manage that channel's webhooks: it reads no message and posts none itself. The Discord page also shows a widget of the community's server, which Discord serves directly.
- **Link previews**: a link to a public character or library shows its name and a summary (for a character: race, class, level, picture, hit points and armor class) wherever it is pasted, Discord included. A private character's link shows nothing of it.
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

Connections are encrypted (HTTPS), passwords are never stored in clear, Discord webhooks are stored encrypted with a key kept outside the database and its backups, and files are kept in private storage that only the application can reach.

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
- **Votre compte Discord**, si vous le liez : son identifiant et son nom, pour vous mentionner au tour de votre personnage et vous permettre de vous connecter avec Discord ; rien d'autre. DiceCloud ne garde aucun jeton Discord : l'autorisation que vous lui donnez reste dans votre compte Discord, ce qui permet de vous connecter en un clic, jusqu'à ce que vous retiriez DiceCloud des Applications autorisées, dans les paramètres de Discord.
- **Salons Discord**, si vous y connectez un personnage ou un tableau de groupe : les identifiants du serveur et du salon Discord, et le webhook que l'application de DiceCloud y reçoit, que seul le serveur conserve, chiffré. L'accès que Discord accorde avec lui est jeté aussitôt.
- **Les commandes de DiceCloud sur Discord**, si vous les utilisez : ce que vous demandez (le jet, le test, les points de vie changés, l'action ou le sort utilisé), qui va au journal de votre personnage comme depuis la fiche ; votre identifiant d'utilisateur Discord et les identifiants du serveur et du salon d'où cela vient, pour y répondre, non conservés ; le personnage que vous choisissez pour chaque serveur avec /personnage, jusqu'à ce que vous en choisissiez un autre, déliiez votre compte Discord ou supprimiez le vôtre ; pendant que vous répondez aux menus de /action, l'action et ce que vous y choisissez (ses cibles, l'emplacement de sort, les munitions, ses choix), 15 minutes au plus ; pendant 30 jours, les dernières cibles que vous avez choisies pour chaque action avec /action, que son menu propose ensuite en premier ; et, pendant 30 jours, ce qu'un bouton « Relancer » relance (sous le jet d'une commande, ou sous un test ou un jet de sauvegarde publié sur un salon connecté).
- **Votre contenu** : vos personnages et leurs journaux, vos dossiers et tableaux de groupe, vos bibliothèques, et les adresses de webhook Discord que vous pouvez renseigner sur un personnage ou, comme meneur de jeu, sur un tableau de groupe (conservées chiffrées sur le serveur, et montrées à personne, vous compris), avec les séances Discord que vous y ouvrez (les identifiants d'un post de forum, d'un fil ou d'un message, et la date) et les dix dernières, pour en reprendre une (les identifiants et les noms de leurs fils, leurs salons, et leurs dates).
- **Vos fichiers** : les images que vous envoyez et les archives de vos personnages.
- **Données techniques** : adresses IP et journaux techniques, traités par le serveur et par Cloudflare.

Nous n'utilisons aucun outil de mesure d'audience, de publicité ou de profilage, et nous ne vendons ni ne louons vos données.

## Pourquoi, et sur quelle base légale

- **Fournir le service** (votre compte, votre contenu, le partage, les tableaux de groupe, les e-mails de vérification et de réinitialisation du mot de passe, la publication sur Discord quand vous la demandez) : c'est nécessaire à l'exécution des [conditions d'utilisation](/terms) que vous acceptez (article 6.1.b du RGPD).
- **Sécuriser le service** (limitation du nombre de requêtes, journaux techniques, sauvegardes) : c'est notre intérêt légitime (article 6.1.f du RGPD).

## Qui peut voir vos données

- **Les autres utilisateurs** : les personnes avec qui vous partagez un personnage ou une bibliothèque voient votre nom d'utilisateur, et toute personne qui en a le lien peut consulter un personnage ou une bibliothèque que vous rendez public. Sur un tableau de groupe, le meneur de jeu peut consulter et modifier les personnages que vous y amenez tant qu'ils y restent, et les membres voient les noms d'utilisateur et les personnages les uns des autres.
- **Nos prestataires**, pour notre compte uniquement : Cloudflare, par qui passent toutes les connexions au service ; Amazon Web Services (S3), qui stocke les fichiers ; Brevo, qui envoie les e-mails ; Google, uniquement si vous vous connectez avec Google.
- **Discord**, uniquement si un webhook est renseigné ou un salon connecté : sur un personnage, son journal, son nom et son image sont publiés sur le salon Discord choisi, selon les règles de confidentialité de Discord ; sur un tableau de groupe, par son meneur de jeu, les combats du groupe (noms, ordre d'initiative et états, jamais les points de vie d'un monstre) ainsi que le journal, le nom et l'image des personnages qu'y amènent ses joueurs sont publiés sur le salon du groupe. Le tableau de groupe et son invitation l'indiquent aux joueurs. Un joueur qui a lié son compte Discord est mentionné au tour de son personnage, sauf s'il le désactive dans les réglages de son compte. Lier votre compte Discord ou vous connecter avec lui passe par la page d'autorisation de Discord. La réponse à une commande de DiceCloud va au salon où elle a été lancée, à vous seul quand elle est secrète, et ne montre jamais les statistiques d'un monstre à personne d'autre que son meneur de jeu. Le bot de DiceCloud, une fois qu'un administrateur du serveur l'a ajouté, ne fait que créer le fil d'une séance dans le salon texte où publie le webhook d'un groupe ou d'un personnage, et le webhook de DiceCloud là où /connecter est lancée par une personne qui peut gérer les webhooks de ce salon : il ne lit aucun message et n'en publie aucun lui-même. La page Discord affiche aussi un module du serveur de la communauté, que Discord fournit directement.
- **Aperçus des liens** : un lien vers un personnage ou une bibliothèque public montre son nom et un résumé (pour un personnage : race, classe, niveau, image, points de vie et classe d'armure) là où il est collé, Discord compris. Le lien d'un personnage privé ne montre rien de lui.
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

Les échanges sont chiffrés (HTTPS), les mots de passe ne sont jamais stockés en clair, les webhooks Discord sont stockés chiffrés avec une clé gardée hors de la base et de ses sauvegardes, et les fichiers sont conservés dans un espace privé que seule l'application peut atteindre.

## Vos droits

Vous pouvez à tout moment accéder à vos données, les rectifier, les faire effacer, en limiter le traitement ou vous y opposer, et en recevoir une copie (portabilité). Vous pouvez modifier la plupart d'entre elles depuis la page Compte, télécharger chacun de vos personnages depuis le menu de sa fiche, et supprimer votre compte vous-même. Pour toute autre demande, écrivez à ${contact}. Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL ([www.cnil.fr](https://www.cnil.fr)).

## Modifications

Ces règles peuvent évoluer. La date en haut de la page indique leur dernière mise à jour. `);
  },
};
