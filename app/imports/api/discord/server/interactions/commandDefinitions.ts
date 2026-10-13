import { Meteor } from 'meteor/meteor';

// node:crypto, on the server alone, as in secretCipher.ts
const crypto: typeof import('node:crypto') = Meteor.isServer
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? require('node:crypto') : {} as typeof import('node:crypto');

/*
 * DiceCloud's slash commands (D6), as Discord registers them: global, for a
 * server that installed the application and for a user who installed it on
 * their account (integration_types 0 and 1), in servers, in the
 * application's DMs and in private channels (contexts 0, 1, 2). English names
 * with French localizations; the replies are in the language of whoever runs
 * them. The hash of these definitions says when to register them again
 * (commandRegistration.ts).
 */

const STRING = 3;
const INTEGER = 4;
const BOOLEAN = 5;
const CHAT_INPUT = 1;

type Option = {
  type: number,
  name: string,
  name_localizations: { fr: string },
  description: string,
  description_localizations: { fr: string },
  required?: boolean,
  autocomplete?: boolean,
  min_value?: number,
  max_value?: number,
  max_length?: number,
  choices?: { name: string, name_localizations: { fr: string }, value: number }[],
};

const option = (type: number, [name, frName]: [string, string], [description, frDescription]: [string, string], rest: Partial<Option> = {}): Option => ({
  type, name, name_localizations: { fr: frName }, description, description_localizations: { fr: frDescription }, ...rest,
});

const CHARACTER = option(STRING, ['character', 'personnage'],
  ['The character, if not the one chosen with /character', 'Le personnage, si ce n\'est pas celui choisi avec /personnage'],
  { autocomplete: true, max_length: 100 });

const SECRET = option(BOOLEAN, ['secret', 'secret'],
  ['Only you see the result (it stays in the character\'s log)', 'Vous seul voyez le résultat (il reste au journal du personnage)']);

const ADVANTAGE = option(INTEGER, ['advantage', 'avantage'], ['Advantage or disadvantage', 'Avantage ou désavantage'], {
  choices: [
    { name: 'Advantage', name_localizations: { fr: 'Avantage' }, value: 1 },
    { name: 'Disadvantage', name_localizations: { fr: 'Désavantage' }, value: -1 },
    { name: 'Normal', name_localizations: { fr: 'Normal' }, value: 0 },
  ],
});

const command = ([name, frName]: [string, string], [description, frDescription]: [string, string], options: Option[], rest: Record<string, unknown> = {}) => ({
  type: CHAT_INPUT,
  name,
  name_localizations: { fr: frName },
  description,
  description_localizations: { fr: frDescription },
  integration_types: [0, 1],
  contexts: [0, 1, 2],
  options,
  ...rest,
});

// Manage Webhooks (1 << 29): who may connect a channel, as Discord shows the command (phase D)
const MANAGE_WEBHOOKS = String(BigInt(1) << BigInt(29));

export const COMMANDS = [
  command(['roll', 'jet'], ['Roll dice for your character, as the log does', 'Lancer des dés pour votre personnage, comme le journal'], [
    option(STRING, ['formula', 'formule'], ['What to roll: 1d20 + 5, 2d6 + strength.modifier...', 'Quoi lancer : 1d20 + 5, 2d6 + strength.modifier...'],
      { required: true, max_length: 200 }),
    CHARACTER,
    SECRET,
  ]),
  command(['check', 'test'], ['A skill or ability check', 'Un test de compétence ou de caractéristique'], [
    option(STRING, ['skill', 'compétence'], ['The skill or ability', 'La compétence ou la caractéristique'],
      { required: true, autocomplete: true, max_length: 100 }),
    ADVANTAGE,
    CHARACTER,
    SECRET,
  ]),
  command(['save', 'sauvegarde'], ['A saving throw', 'Un jet de sauvegarde'], [
    option(STRING, ['ability', 'caractéristique'], ['The saving throw', 'Le jet de sauvegarde'],
      { required: true, autocomplete: true, max_length: 100 }),
    ADVANTAGE,
    CHARACTER,
    SECRET,
  ]),
  command(['hp', 'pv'], ['Hit points: see them, or deal damage, heal, give temporary ones', 'Points de vie : les voir, ou infliger des dégâts, soigner, donner des temporaires'], [
    option(INTEGER, ['damage', 'dégâts'], ['Damage taken', 'Dégâts subis'], { min_value: 1, max_value: 100000 }),
    option(INTEGER, ['healing', 'soins'], ['Hit points regained', 'Points de vie récupérés'], { min_value: 1, max_value: 100000 }),
    option(INTEGER, ['temporary', 'temporaires'], ['Temporary hit points to set', 'Points de vie temporaires à fixer'], { min_value: 0, max_value: 100000 }),
    CHARACTER,
  ]),
  command(['character', 'personnage'], ['Choose your character for this server, or see which it is', 'Choisir votre personnage pour ce serveur, ou voir lequel c\'est'], [
    option(STRING, ['name', 'nom'], ['The character', 'Le personnage'], { autocomplete: true, max_length: 100 }),
  ]),
  // Phase D: in a server only, and shown to those who may manage its webhooks
  command(['connect', 'connecter'], ['Connect this channel, or this post\'s forum, to a party or a character', 'Connecter ce salon, ou le forum de ce post, à un groupe ou un personnage'], [
    option(STRING, ['target', 'cible'], ['The party (its game master) or the character (its editors)', 'Le groupe (son MJ) ou le personnage (ceux qui le modifient)'],
      { required: true, autocomplete: true, max_length: 100 }),
  ], { contexts: [0], default_member_permissions: MANAGE_WEBHOOKS }),
];

/** The definitions' hash: a change registers them again */
export function commandsHash(): string {
  return crypto.createHash('sha256').update(JSON.stringify(COMMANDS)).digest('hex');
}
