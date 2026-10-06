import { get } from 'lodash';
import en from '/imports/ui/i18n/en.json';
import fr from '/imports/ui/i18n/fr.json';
import { logLineTone, translateLogLine, type LogI18n } from '/imports/api/creature/log/logMessages';
import { withTotals } from '/imports/ui/log/logTotals';
import { rollsFromLog } from '/imports/ui/dice/logDice';

/*
 * A log entry as Discord webhook messages (option 2 of the Discord analysis):
 * an embed titled with the action or the roll, linked to the character sheet,
 * coloured by the character or by a critical, with each line's result first.
 * Written in the language of the character's owner, as the log shows it to
 * them: lines hidden in the log (silenced) are never sent. Pure: the server
 * posts what this returns (server/discordWebhooks.ts).
 */

// https://discord.com/developers/docs/resources/message#embed-object-embed-limits
export const DISCORD_LIMITS = {
  embedsPerMessage: 10,
  // Title, description, field names and values of all of a message's embeds
  charactersPerMessage: 6000,
  fieldsPerEmbed: 25,
  title: 256,
  description: 4096,
  fieldName: 256,
  fieldValue: 1024,
  username: 80,
};

// The app's success and error seeds (ui/plugins/themes.js): a critical hit,
// a critical miss
export const CRITICAL_HIT_COLOR = 0x43A047;
export const CRITICAL_MISS_COLOR = 0xFF6D00;

// Discord refuses an empty name or value: a zero-width space stands in
const BLANK = '​';

const MESSAGES = { en, fr };
export type DiscordLanguage = keyof typeof MESSAGES;

/** The owner's interface language when the messages have it, English otherwise */
export function discordLanguage(language?: string): DiscordLanguage {
  return language && language in MESSAGES ? language as DiscordLanguage : 'en';
}

type Translate = (key: string, params: Record<string, string | number>) => string | undefined;

/**
 * Messages in a language, as the log's `translate`: the language's message for
 * the key, else the English one, with its {parameters} filled in. The log's
 * messages use no other vue-i18n syntax.
 */
export function translatorFor(language: DiscordLanguage): Translate {
  return (key, params) => {
    const template = get(MESSAGES[language], key) ?? get(en, key);
    if (typeof template !== 'string') return undefined;
    return template.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match);
  };
}

export type LogLine = {
  name?: string,
  value?: string,
  inline?: boolean,
  silenced?: boolean,
  i18n?: LogI18n,
};

// A line as the log shows it: translated, its result taken out (logTotals.js)
type ShownLine = LogLine & { total?: string, totalLabel?: string, detail?: boolean };

export type DiscordField = { name: string, value: string, inline: boolean };
export type DiscordEmbed = {
  title?: string,
  url?: string,
  description?: string,
  color?: number,
  timestamp?: string,
  fields: DiscordField[],
};
export type WebhookMessage = {
  username?: string,
  avatar_url?: string,
  embeds: DiscordEmbed[],
  allowed_mentions: { parse: string[] },
};

/** The lines a reader of the log sees: hidden (silenced) lines never leave */
export function visibleLines<T extends LogLine>(content: T[] = []): T[] {
  return content.filter(line => line && !line.silenced);
}

/**
 * 'success' for a critical hit, 'error' for a critical miss: as the engine
 * marks an attack's line (whatever its crit range), else the natural 20 or 1
 * of an entry that rolled a single d20 and kept it (a check, a typed roll)
 */
export function entryTone(lines: LogLine[]): 'success' | 'error' | undefined {
  for (const line of lines) {
    const tone = logLineTone(line);
    if (tone) return tone;
  }
  const d20s = rollsFromLog(lines).groups
    .flatMap(group => group.dice)
    .filter(die => die.size === 20 && !die.dropped);
  if (d20s.length !== 1) return undefined;
  if (d20s[0].value === 20) return 'success';
  if (d20s[0].value === 1) return 'error';
  return undefined;
}

/** A creature's colour, `#1976d2` or `#A23`, as Discord's integer */
export function colorNumber(color?: string): number | undefined {
  const hex = /^#([a-f0-9]{3}|[a-f0-9]{6})$/i.exec(color || '')?.[1];
  if (!hex) return undefined;
  return parseInt(hex.length === 3 ? hex.replace(/./g, digit => digit + digit) : hex, 16);
}

/** Text cut to `max` characters, ending with an ellipsis when it was cut */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = max - 1;
  // Never split a character in two (a surrogate pair)
  const code = text.charCodeAt(end - 1);
  if (code >= 0xD800 && code <= 0xDBFF) end -= 1;
  return text.slice(0, end) + '…';
}

// Discord refuses a webhook username containing these, and an empty one
const FORBIDDEN_USERNAME = /discord|clyde/i;

/** The name a message is posted under: the character's, when Discord takes it */
export function webhookUsername(name?: string): string | undefined {
  const trimmed = (name || '').trim();
  if (!trimmed || FORBIDDEN_USERNAME.test(trimmed)) return undefined;
  return truncate(trimmed, DISCORD_LIMITS.username);
}

const isHttpUrl = (url?: string) => !!url && /^https?:\/\/\S+$/i.test(url);

// A line's text: its result first, in bold, then what made it
function lineText(line: ShownLine): string {
  const total = line.total !== undefined
    ? `**${line.total}**${line.totalLabel ? ` ${line.totalLabel}` : ''}`
    : '';
  return [total, line.value].filter(Boolean).join('\n');
}

const hasDice = (text?: string) => !!text && rollsFromLog([{ value: text }]).groups.length > 0;

// The size Discord counts against a message's 6,000 characters
const embedSize = (embed: DiscordEmbed) => (embed.title?.length || 0) + (embed.description?.length || 0)
  + embed.fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);
const fieldSize = (field: DiscordField) => field.name.length + field.value.length;

type MessageInput = {
  log: { content?: LogLine[], date?: Date | string },
  creature: { name?: string, color?: string, avatarPicture?: string },
  language?: string,
  // The character sheet, which the title links to
  sheetUrl?: string,
};

/**
 * The messages that post a log entry to a webhook, in order: usually one,
 * more when the entry is longer than Discord takes in one message. None when
 * every line is hidden.
 */
export function discordMessages({ log, creature, language, sheetUrl }: MessageInput): WebhookMessage[] {
  const translate = translatorFor(discordLanguage(language));
  const lines: ShownLine[] = withTotals(visibleLines(log.content).map(line => translateLogLine(line, translate)));
  if (!lines.length) return [];
  const [first, ...rest] = lines;

  // The title names the action, the rest, the effect...; a roll typed in the
  // log has no name, its first line is the roll as typed, and the lines that
  // follow it are its steps: the result and the dice say enough
  let title: string;
  let description: string;
  let others = rest;
  if (first.name) {
    title = first.name;
    description = lineText(first);
  } else {
    const [typed, ...more] = (first.value || '').split('\n');
    title = typed ? translate('discord.typedRoll', { roll: typed }) || typed : '';
    let steps = 0;
    while (steps < rest.length && rest[steps].detail) steps += 1;
    const details = rest.slice(0, steps).map(line => line.value || '');
    const dice = details.filter(hasDice);
    others = rest.slice(steps);
    description = [
      first.total !== undefined ? `**${first.total}**` : '',
      ...more,
      ...(dice.length ? dice : details),
    ].filter(Boolean).join('\n');
  }
  if (!title) title = creature.name || '';

  const tone = entryTone(lines);
  const color = tone === 'success' ? CRITICAL_HIT_COLOR
    : tone === 'error' ? CRITICAL_MISS_COLOR
      : colorNumber(creature.color);
  const date = log.date ? new Date(log.date) : undefined;
  const head: DiscordEmbed = {
    ...title && { title: truncate(title, DISCORD_LIMITS.title) },
    ...isHttpUrl(sheetUrl) && { url: sheetUrl },
    ...description && { description: truncate(description, DISCORD_LIMITS.description) },
    ...color !== undefined && { color },
    ...date && !isNaN(date.getTime()) && { timestamp: date.toISOString() },
    fields: [],
  };
  const fields: DiscordField[] = others.map(line => ({
    name: truncate(line.name || BLANK, DISCORD_LIMITS.fieldName),
    value: truncate(lineText(line) || BLANK, DISCORD_LIMITS.fieldValue),
    inline: !!line.inline,
  }));

  // Fields fill an embed up to 25, then the next one, in the same colour;
  // embeds fill a message up to 10 or 6,000 characters, then the next message
  const messages: DiscordEmbed[][] = [[]];
  let embed = head;
  let used = embedSize(head);
  const close = () => messages[messages.length - 1].push(embed);
  for (const field of fields) {
    const size = fieldSize(field);
    const embedFull = embed.fields.length >= DISCORD_LIMITS.fieldsPerEmbed;
    if (embedFull || used + size > DISCORD_LIMITS.charactersPerMessage) {
      close();
      const messageFull = messages[messages.length - 1].length >= DISCORD_LIMITS.embedsPerMessage
        || used + size > DISCORD_LIMITS.charactersPerMessage;
      if (messageFull) {
        messages.push([]);
        used = 0;
      }
      embed = { ...color !== undefined && { color }, fields: [] };
    }
    embed.fields.push(field);
    used += size;
  }
  close();

  const username = webhookUsername(creature.name);
  return messages.map(embeds => ({
    ...username && { username },
    ...isHttpUrl(creature.avatarPicture) && { avatar_url: creature.avatarPicture },
    embeds,
    // Never ping anyone, whatever the log says
    allowed_mentions: { parse: [] },
  }));
}
