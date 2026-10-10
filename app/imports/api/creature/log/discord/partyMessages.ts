import { translatorFor, discordLanguage, truncate, DISCORD_LIMITS } from '/imports/api/creature/log/discord/discordMessages';

/*
 * The messages of a party's Discord channel (D2) and of its sessions (D3):
 * the initiative message, posted when a fight starts and edited at each turn
 * and change (a line says the fight starts when the game master turned it
 * off); a short line for each turn; a summary at the end; the header that
 * opens a session. Pure: the server posts them (server/discordInitiative.ts,
 * server/discordWebhooks.ts).
 *
 * The players read the channel: as on the party board, nothing here ever
 * gives a monster's hit points away, nor its armor class, nor whether it is
 * hurt. Its conditions, yes. The initiative results and who is out of the
 * fight show on the board to everyone already.
 */

// Discord limits a thread's name to 100 characters
export const THREAD_NAME_LENGTH = 100;

// Never ping anyone: the mentions of D5 will say whom
const NO_MENTIONS = { allowed_mentions: { parse: [] } };

/** Text shown as typed: a name with a * or a _ does not turn bold or italic */
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\*_~`|>#[\]-])/g, '\\$1');
}

/**
 * The date of a session in the language of the channel, in the time zone of
 * the browser that opened it when it is a valid one
 */
export function sessionDate(date: Date, language?: string, timeZone?: string): string {
  const locale = discordLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long', ...timeZone && { timeZone } }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date);
  }
}

/** "Session of October 10, 2026 — The Heroes", short enough for a thread's name */
export function sessionName({ label, date, language, timeZone }: {
  label?: string, date: Date, language?: string, timeZone?: string,
}): string {
  const translate = translatorFor(discordLanguage(language));
  const day = sessionDate(date, language, timeZone);
  const name = label?.trim()
    ? translate('discord.sessionName', { date: day, name: label.trim() })
    : translate('discord.sessionNameAlone', { date: day });
  return truncate(name || day, THREAD_NAME_LENGTH);
}

/** The message that opens a session: the forum post's first, or a header in a text channel */
export function sessionHeader(name: string, author: { username?: string, avatar_url?: string } = {}) {
  return { ...author, content: `## ${escapeMarkdown(name)}`, ...NO_MENTIONS };
}

// A creature of the fight, as the channel shows it: never its stats
export type InitiativeRow = {
  name: string,
  initiative?: number,
  out?: boolean,
  // A character of the party (not a monster, nor a creature added by hand)
  character?: boolean,
  conditions?: string[],
};

type InitiativeInput = {
  rows: InitiativeRow[],
  round: number,
  // The index in `rows` of the creature whose turn it is
  turn: number,
  language?: string,
  // The fight is over: no one has the turn any more
  ended?: boolean,
};

function rowText(row: InitiativeRow, current: boolean, translate: ReturnType<typeof translatorFor>): string {
  const result = Number.isFinite(row.initiative) ? String(row.initiative) : '–';
  const conditions = row.conditions?.length ? ` · *${row.conditions.map(escapeMarkdown).join(', ')}*` : '';
  let text = `\`${result.padStart(2, ' ')}\` ${escapeMarkdown(row.name)}`;
  if (row.out) text = `~~${text}~~ (${translate('discord.outOfFight', {})})`;
  if (current) return `▶ **${text}**${conditions}`;
  return `${text}${conditions}`;
}

/**
 * The initiative message: the order, the round, whose turn it is, each
 * creature's conditions. An embed, which Discord lets the webhook edit in
 * place at each turn
 */
export function initiativeMessage({ rows, round, turn, language, ended }: InitiativeInput) {
  const translate = translatorFor(discordLanguage(language));
  const title = ended
    ? translate('discord.initiativeEnded', { round })
    : translate('discord.initiativeTitle', { round });
  const description = rows.map((row, index) => rowText(row, !ended && index === turn, translate)).join('\n');
  return {
    embeds: [{
      title: truncate(title || '', DISCORD_LIMITS.title),
      description: truncate(description || '–', DISCORD_LIMITS.description),
    }],
    ...NO_MENTIONS,
  };
}

/** The line that says a fight starts, as plain text, when no initiative message does */
export function combatStart(language?: string) {
  const content = translatorFor(discordLanguage(language))('discord.combatStarts', {});
  return content ? { content, ...NO_MENTIONS } : undefined;
}

/**
 * The turn's line, as plain text: "Your turn: Aria" for a character of the
 * party, "Goblin 1's turn" for anyone else. Text, not a card: a mention in it
 * notifies the player (D5)
 */
export function turnLine(row: InitiativeRow | undefined, language?: string) {
  if (!row) return undefined;
  const translate = translatorFor(discordLanguage(language));
  const name = escapeMarkdown(row.name);
  const content = row.character
    ? translate('discord.yourTurn', { name })
    : translate('discord.creatureTurn', { name });
  return content ? { content, ...NO_MENTIONS } : undefined;
}

/** The end of the fight: how many rounds, who fought, who was put out of it */
export function combatSummary({ rows, round, language, partyName }: {
  rows: InitiativeRow[], round: number, language?: string, partyName?: string,
}) {
  const translate = translatorFor(discordLanguage(language));
  const names = (list: InitiativeRow[]) => list.map(row => escapeMarkdown(row.name)).join(', ');
  const out = rows.filter(row => row.out);
  const lines = [
    translate('discord.summaryRounds', { rounds: round }),
    translate('discord.summaryParticipants', { names: names(rows) }),
    ...out.length ? [translate('discord.summaryOut', { names: names(out) })] : [],
  ].filter(Boolean);
  const title = partyName?.trim()
    ? translate('discord.summaryTitleParty', { name: partyName.trim() })
    : translate('discord.summaryTitle', {});
  return {
    embeds: [{
      title: truncate(title || '', DISCORD_LIMITS.title),
      description: truncate(lines.join('\n'), DISCORD_LIMITS.description),
    }],
    ...NO_MENTIONS,
  };
}
