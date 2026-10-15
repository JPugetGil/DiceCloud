import { get } from 'lodash';
import en from '/imports/ui/i18n/en.json';

/*
 * Log lines in the reader's language. The engine writes each line's `name`
 * and `value` in English, as always: the Discord webhook sends them, and older
 * logs and clients read nothing else. A line it can translate also carries
 * `i18n`: message keys of the interface's translations (`logs.*` in
 * imports/ui/i18n) and their parameters, which the log translates when it
 * shows the line (imports/ui/log/translateLog.js). The English text is made
 * from en.json, so the two cannot drift apart.
 */

// A message key and its parameters. A parameter may itself be a message (a
// damage type's name); `fallback` is shown when the key is unknown (a custom
// damage type)
export type LogMessage = {
  key: string,
  params?: Record<string, LogParam>,
  fallback?: string,
};
export type LogParam = string | number | LogMessage;
// A value is made of parts, joined by line breaks: plain text (a dice roll,
// a property's name) or a message
export type LogPart = string | LogMessage;
export type LogI18n = {
  name?: LogMessage,
  value?: LogPart[],
};

export const msg = (key: string, params?: Record<string, LogParam>): LogMessage => (
  params ? { key, params } : { key }
);

export const isMessage = (part: unknown): part is LogMessage =>
  !!part && typeof part === 'object' && typeof (part as LogMessage).key === 'string';

// A damage type's name: translated if it is one of the standard ones
export const damageTypeMessage = (type: string): LogMessage => ({
  key: `damageTypes.${type}`, fallback: type,
});

// An attribute type's name ("Health bar"), from its stored value
export const attributeTypeMessage = (type: string, fallback: string): LogMessage => ({
  key: `attributeTypes.${type}`, fallback,
});

// "Roll (Advantage)": a name followed by its advantage, when it has one
export function withAdvantage(name: LogMessage, advantage?: number): LogMessage {
  if (advantage === 1) return msg('logs.withAdvantage', { name });
  if (advantage === -1) return msg('logs.withDisadvantage', { name });
  return name;
}

/**
 * The text of a message, given `translate(key, params)`, which returns the
 * message for that key with its parameters filled in, or undefined when it has
 * none. Parameters that are messages are translated first.
 */
export function renderMessage(
  part: LogPart, translate: (key: string, params: Record<string, string | number>) => string | undefined
): string {
  if (!isMessage(part)) return part;
  const params: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(part.params ?? {})) {
    params[name] = isMessage(value) ? renderMessage(value, translate) : value;
  }
  return translate(part.key, params) ?? part.fallback ?? part.key;
}

// en.json's message for a key, with its {parameters} filled in
export function englishMessage(key: string, params: Record<string, string | number> = {}) {
  const template = get(en, key);
  if (typeof template !== 'string') return undefined;
  return template.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match);
}

export const toEnglish = (part: LogPart) => renderMessage(part, englishMessage);

type LineInput = {
  name?: string | LogMessage,
  value?: LogPart | LogPart[],
  inline?: boolean,
  silenced?: boolean,
  context?: any,
};

/**
 * A log line from messages or plain text: its English `name` and `value`, and
 * `i18n` with the messages, when it has any
 */
export function logLine<T extends LineInput>(line: T): Omit<T, 'name' | 'value'> & {
  name?: string, value?: string, i18n?: LogI18n,
} {
  const { name, value, ...rest } = line;
  const result: Omit<T, 'name' | 'value'> & { name?: string, value?: string, i18n?: LogI18n } = { ...rest };
  const i18n: LogI18n = {};
  if (name !== undefined) {
    result.name = toEnglish(name);
    if (isMessage(name)) i18n.name = name;
  }
  if (value !== undefined) {
    const parts = Array.isArray(value) ? value : [value];
    result.value = parts.map(toEnglish).join('\n');
    if (parts.some(isMessage)) i18n.value = parts;
  }
  if (i18n.name || i18n.value) result.i18n = i18n;
  return result;
}

type Translate = (key: string, params: Record<string, string | number>) => string | undefined;

/**
 * A stored log line as the reader reads it: its name and value rendered with
 * `translate` from its messages, when it has some; as stored otherwise (older
 * logs, text typed by users)
 */
export function translateLogLine<T extends { name?: string, value?: string, i18n?: LogI18n }>(
  line: T, translate: Translate
): T {
  const i18n = line?.i18n;
  if (!i18n) return line;
  const result = { ...line };
  if (isMessage(i18n.name)) result.name = renderMessage(i18n.name, translate);
  if (Array.isArray(i18n.value)) result.value = i18n.value.map(part => renderMessage(part, translate)).join('\n');
  return result;
}

// The lines that change a creature's attribute: their amount is capped by
// what it has left ("−7 Hit Points" on a goblin with 7), or they give its
// value ("Hit Points set from 7 to 0"); and the reminder of a creature that
// concentrates, which says it does (dealDamage)
const ATTRIBUTE_CHANGE_KEYS = [
  'logs.attributeDamaged', 'logs.attributeRestored', 'logs.attributeSet', 'logs.concentrationCheck',
];

// The message keys a line is made of: its name's, its value's parts', and
// those of the messages they hold ("Lyra · Hit points damaged", namingTargets)
function messageKeys(line: { i18n?: LogI18n }): string[] {
  const keysOf = (part: LogParam | undefined): string[] => isMessage(part)
    ? [part.key, ...Object.values(part.params ?? {}).flatMap(keysOf)]
    : [];
  return [line.i18n?.name, ...line.i18n?.value ?? []].flatMap(keysOf);
}

/**
 * The lines but those that give away the hit points (or another attribute)
 * of a game master's creature among `hiddenIds`, a monster or a non-player
 * character, that the line acted on: the players never learn them, in a
 * character's log as on Discord (partyBoard.js). The creature's own log
 * keeps them, for its game master (writeActionResults.ts)
 */
export function withoutHiddenStats<T extends { i18n?: LogI18n, targetIds?: string[] }>(lines: T[], hiddenIds: string[]): T[] {
  if (!hiddenIds.length) return lines;
  return lines.filter(line => !(line.targetIds?.some(id => hiddenIds.includes(id))
    && messageKeys(line).some(key => ATTRIBUTE_CHANGE_KEYS.includes(key))));
}

// The longest name a stored line takes (LogContentSchema): the creatures' and
// the properties' own limit
const LINE_NAME_MAX = 128;

/** A line's English name, cut to what a log stores; its message stays whole */
export function fitLineName(name: string): string {
  return name.length <= LINE_NAME_MAX ? name : `${name.slice(0, LINE_NAME_MAX - 1)}…`;
}

/**
 * An action's lines as its actor's log shows them, when the action acted on
 * several creatures: each line about one of them alone names it, "Lyra ·
 * Failed save", where three "Failed save" said nothing of whose they were (a
 * breath on three characters). The lines stay in the engine's order, which
 * may interleave the targets (an attack's rolls, then each one's damage).
 * Lines about several of them, about the actor alone, without a name, or
 * that name their target already (a hidden target's saving throw,
 * applySavingThrowProperty), stay as they are; so does the entry of an action
 * on one creature or none. Each target's own entry (writeActionResults) is
 * about it alone, and names none. `nameOf`: a target's name, from its id
 */
export function namingTargets<T extends { name?: string, i18n?: LogI18n, targetIds?: string[] }>(
  lines: T[], targetIds: string[] | undefined, nameOf: (id: string) => string | undefined,
): T[] {
  const targets = [...new Set(targetIds || [])];
  if (targets.length < 2) return lines;
  return lines.map(line => {
    const [subject, ...others] = line.targetIds || [];
    if (!subject || others.length || !targets.includes(subject) || !line.name) return line;
    if (line.i18n?.name?.key === 'logs.forTarget') return line;
    const name = msg('logs.forTarget', { target: nameOf(subject) || '?', name: line.i18n?.name ?? line.name });
    return { ...line, name: fitLineName(toEnglish(name)), i18n: { ...line.i18n, name } };
  });
}

/**
 * 'success' for a critical hit, 'error' for a critical miss, from the line's
 * message (whatever the language) or, for older logs, its English name
 */
export function logLineTone(line?: { name?: string, i18n?: LogI18n }): 'success' | 'error' | undefined {
  const keys: string[] = [];
  let message: LogParam | undefined = line?.i18n?.name;
  while (isMessage(message)) {
    keys.push(message.key);
    message = message.params?.name;
  }
  if (keys.includes('logs.criticalHit')) return 'success';
  if (keys.includes('logs.criticalMiss')) return 'error';
  if (keys.length) return undefined;
  // Lines logged before the keys: "Critical Hit!", later "Critical hit!"
  if (/^critical hit/i.test(line?.name ?? '')) return 'success';
  if (/^critical miss/i.test(line?.name ?? '')) return 'error';
  return undefined;
}
