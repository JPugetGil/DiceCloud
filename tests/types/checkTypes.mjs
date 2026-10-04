#!/usr/bin/env node
/**
 * Type checks the app and fails only on errors that baseline.txt does not
 * list: the app had a backlog of errors when this check started, and new code
 * must not add to it.
 *
 * Run from app/, after Meteor has built the app once (meteor, or meteor test),
 * which writes the packages' types to .meteor/local/types:
 *
 *   meteor npm run typecheck              compare with the baseline
 *   meteor npm run typecheck -- --update  rewrite it, after fixing errors
 *
 * Only errors in the app's own files count: those in node_modules and in the
 * generated Meteor types change with the versions installed, not with the
 * app's code. An error is compared by file, code and message, without its
 * line, so that editing a file doesn't make its old errors look new.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASELINE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'baseline.txt');
const appDir = process.cwd();
const update = process.argv.includes('--update');

if (!existsSync(path.join(appDir, '.meteor/local/types/packages.d.ts'))) {
  console.error('Missing .meteor/local/types: run meteor (or meteor test) in app/ once first.');
  process.exit(2);
}

const tsc = createRequire(path.join(appDir, 'package.json')).resolve('typescript/bin/tsc');
const result = spawnSync(process.execPath, [tsc, '--noEmit', '--pretty', 'false', '-p', '.'], {
  cwd: appDir,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
if (result.error) throw result.error;

// "file(line,col): error TS1234: message", continued on lines indented by two spaces
const ERROR_LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
const errors = [];
for (const line of `${result.stdout}${result.stderr}`.split('\n')) {
  const match = ERROR_LINE.exec(line);
  if (match) {
    const [, file, row, column, code, message] = match;
    errors.push({ file, row, column, code, message, details: [] });
  } else if (line.startsWith('  ') && errors.length) {
    errors.at(-1).details.push(line);
  } else if (line.trim() && !line.startsWith(' ')) {
    // tsc failed for another reason than type errors
    console.error(line);
  }
}
if (result.status !== 0 && !errors.length) {
  console.error(`tsc exited with ${result.status} without reporting type errors`);
  process.exit(2);
}

const isAppFile = file => !/^(node_modules|\.meteor|\.\.)[\\/]/.test(file) && !path.isAbsolute(file);
// A Meteor package without type declarations, such as aldeed:simple-schema,
// resolves to the generated packages.d.ts, which is not a module: every file
// importing it gets this error, whatever its code
const isUntypedMeteorPackage = ({ code, message }) =>
  code === 'TS2306' && message.includes('.meteor/local/types/packages.d.ts');
const keyOf = ({ file, code, message }) =>
  `${file.replaceAll('\\', '/')}: ${code}: ${message.replaceAll(appDir, '<app>')}`;

const appErrors = errors.filter(error => isAppFile(error.file) && !isUntypedMeteorPackage(error));
const keys = appErrors.map(keyOf).sort();

if (update) {
  writeFileSync(BASELINE, keys.length ? `${keys.join('\n')}\n` : '');
  console.log(`Wrote ${keys.length} errors to ${path.relative(appDir, BASELINE)}`);
  process.exit(0);
}

const remaining = new Map();
for (const key of readFileSync(BASELINE, 'utf8').split('\n').filter(Boolean)) {
  remaining.set(key, (remaining.get(key) || 0) + 1);
}
const newErrors = [];
for (const error of appErrors) {
  const key = keyOf(error);
  const count = remaining.get(key) || 0;
  if (count) {
    remaining.set(key, count - 1);
  } else {
    newErrors.push(error);
  }
}
const fixed = [...remaining.values()].reduce((sum, count) => sum + count, 0);

for (const { file, row, column, code, message, details } of newErrors) {
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error file=app/${file},line=${row},col=${column},title=${code}::${message}`);
  }
  console.log(`${file}(${row},${column}): error ${code}: ${message}`);
  for (const detail of details) console.log(detail);
}
console.log(`${appErrors.length} type errors in the app, ${newErrors.length} not in the baseline.`);
if (fixed) {
  console.log(`${fixed} errors of the baseline are gone: run \`meteor npm run typecheck -- --update\` to remove them from it.`);
}
process.exit(newErrors.length ? 1 : 0);
