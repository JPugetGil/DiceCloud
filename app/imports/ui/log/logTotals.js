/*
 * A log line's result, taken out of its text to head the line (D6): the
 * engine writes it in bold on the value's last line, `**18**`, or before what
 * it is, `**8** slashing damage`; a roll typed in the log writes its steps on
 * lines without a name and the result alone on the last one.
 */
const NUMBER = '[-−]?\\d+(?:\\.\\d+)?';
// The result on the value's last line, and the words after it
const TOTAL_LINE = new RegExp(`^\\*\\*(${NUMBER})\\*\\*([^*\\n]*)$`);
const BARE_NUMBER = new RegExp(`^${NUMBER}$`);

// A negative total with the minus sign, as wide as the digits
const withMinusSign = text => text.replace(/^-/, '−');

/**
 * The lines of a log entry, each with `total` (a string) and `totalLabel` (the
 * words after it) when it ends with its result; its value then no longer has
 * it. The steps of a typed roll after its first line are `detail`. Lines are
 * as LogContent shows them: translated, not silenced.
 */
export function withTotals(lines = []) {
  const shown = [];
  // Where the run of nameless lines that the current one continues starts
  let runStart;
  for (const line of lines) {
    const value = typeof line.value === 'string' ? line.value : '';
    if (line.name) {
      runStart = undefined;
    } else if (runStart === undefined) {
      runStart = shown.length;
    } else if (BARE_NUMBER.test(value.trim()) && shown[runStart].total === undefined) {
      // A typed roll's result heads the roll's first line; the steps after
      // it are details, as the dice of a line with its result
      shown[runStart] = { ...shown[runStart], total: withMinusSign(value.trim()) };
      for (let i = runStart + 1; i < shown.length; i += 1) shown[i] = { ...shown[i], detail: true };
      runStart = undefined;
      continue;
    }
    const parts = value.split('\n');
    const match = TOTAL_LINE.exec(parts[parts.length - 1].trim());
    if (!match) {
      shown.push(line);
      continue;
    }
    const rest = parts.slice(0, -1).join('\n').trim();
    shown.push({
      ...line,
      value: rest || undefined,
      total: withMinusSign(match[1]),
      totalLabel: match[2].trim() || undefined,
    });
  }
  return shown;
}
