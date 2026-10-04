/*
 * Dice rolls as the parser writes them in the log: `1d20 [ 15, ~~8~~ ]`. A
 * die's value may be `~~dropped~~`, `*added by an explosion*`, `**exploded**`
 * or `__underlined__` (rollArray.ts). Shared by the log's markup
 * (markdownToHtml) and the dice tray.
 */

export type LogDie = {
  value: number,
  dropped?: boolean,
  bold?: boolean,
  italics?: boolean,
  underline?: boolean,
};

// A roll at the start of a string, and anywhere in one
export const DICE_ROLL_AT_START = /^(\d*)d(\d+) ?\[ ?([^\]\n]+?) ?\]/;
const DICE_ROLLS = /(?<!\w)(\d*)d(\d+) ?\[ ?([^\]\n]+?) ?\]/g;

export function parseDie(text: string): LogDie | undefined {
  const die: Partial<LogDie> = {};
  for (const [flag, marker] of [['underline', '__'], ['bold', '**'], ['italics', '*'], ['dropped', '~~']] as const) {
    if (text.length > 2 * marker.length && text.startsWith(marker) && text.endsWith(marker)) {
      die[flag] = true;
      text = text.slice(marker.length, -marker.length);
    }
  }
  if (!/^\d+$/.test(text)) return;
  die.value = +text;
  return die as LogDie;
}

/** The dice of a roll's brackets, undefined if one of them isn't a die */
export function parseDice(list: string): LogDie[] | undefined {
  const dice = list.split(',').map(text => parseDie(text.trim()));
  return dice.every(die => die) ? dice as LogDie[] : undefined;
}

export type RollGroup = {
  // The log line's name: "Roll", "Damage"...
  label?: string,
  // Each die with its number of faces: a line can roll several kinds
  dice: (LogDie & { size: number })[],
  // The roll's result, when the log gives it
  total?: number,
};

/**
 * The dice rolled in a log entry, by log line: the dice of every roll in the
 * line, and its result, written after them in bold, or alone on the next line
 */
export function rollsFromLog(content: { name?: string, value?: string, silenced?: boolean }[] = []): {
  title?: string,
  groups: RollGroup[],
} {
  const lines = content.filter(line => !line.silenced);
  const groups: RollGroup[] = [];
  lines.forEach((line, index) => {
    const value = line.value || '';
    const rolls = [...value.matchAll(DICE_ROLLS)];
    if (!rolls.length) return;
    const dice: (LogDie & { size: number })[] = [];
    for (const roll of rolls) {
      const size = Number(roll[2]);
      dice.push(...(parseDice(roll[3]) || []).map(die => ({ ...die, size })));
    }
    if (!dice.length) return;
    const last = rolls[rolls.length - 1];
    const after = value.slice((last.index || 0) + last[0].length);
    const bold = /\*\*(-?\d+(?:\.\d+)?)\*\*/.exec(after);
    const next = lines[index + 1];
    const nextTotal = !next?.name && /^\s*(-?\d+(?:\.\d+)?)\s*$/.exec(next?.value || '');
    const total = bold ? Number(bold[1]) : nextTotal ? Number(nextTotal[1]) : undefined;
    groups.push({ label: line.name, dice, total });
  });
  // The entry's title: its first line when it only names what was rolled
  const first = lines[0];
  const title = first?.name && !first.value ? first.name : undefined;
  return { title, groups };
}
