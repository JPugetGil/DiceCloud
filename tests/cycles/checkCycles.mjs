#!/usr/bin/env node
/**
 * Fails when the app's imports gain a cycle that baseline.txt does not list.
 * Import cycles make the order modules initialise in depend on which one loads
 * first: removing or adding an import has already crashed `meteor run` at
 * startup ("Cannot access '...' before initialization") while the tests and
 * the build passed. The app had 114 cycles when this check started (madge's
 * count); new code must not add any.
 *
 * Run from app/, after `meteor npm ci` in tests/cycles (madge lives there:
 * its TypeScript peer does not accept the app's TypeScript 6):
 *
 *   meteor npm run cycles              compare with the baseline
 *   meteor npm run cycles -- --update  rewrite it, after removing a cycle
 *   meteor npm run cycles -- --list    also print the cycles madge finds
 *
 * The graph starts at the server and client entry points, follows static and
 * dynamic imports (the startup modules load the app through `await
 * import()`), and leaves out type-only imports, which the build drops, and the
 * tests. The cycles madge lists depend on the order it walks the graph, so
 * adding a file elsewhere can change which ones it prints. What the baseline
 * records instead are the imports that lie on a cycle: those whose two files
 * belong to the same strongly connected component. Every import that closes a
 * new cycle is one of them, and other changes leave them as they are.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(here, 'baseline.txt');
const appDir = process.cwd();
const update = process.argv.includes('--update');
const list = process.argv.includes('--list');

let madge;
try {
  ({ default: madge } = await import('madge'));
} catch {
  console.error('madge is missing: run `meteor npm ci` in tests/cycles first.');
  process.exit(2);
}

const typeImportsOnly = { skipTypeImports: true };
const result = await madge(['server/main.js', 'client/main.js'].map(file => path.join(appDir, file)), {
  baseDir: appDir,
  fileExtensions: ['js', 'mjs', 'ts', 'vue'],
  // Resolves `/imports/...` from app/, as the build does, in every kind of
  // file. Without a tsConfig, madge resolves TypeScript files this way too:
  // it would ignore tsconfig.json's path mapping anyway
  webpackConfig: path.join(here, 'resolve.config.cjs'),
  excludeRegExp: [/\.test\.[a-z]+$/, /\.testFn\.[a-z]+$/],
  detectiveOptions: { es6: typeImportsOnly, ts: typeImportsOnly, tsx: typeImportsOnly },
});
const graph = result.obj();

const unresolved = result.warnings().skipped.filter(dependency => dependency.startsWith('/'));
if (unresolved.length) {
  // A path the resolver misses hides its imports, and the cycles through them
  console.error(`Imports that did not resolve:\n  ${unresolved.join('\n  ')}`);
  process.exit(2);
}

// Tarjan's strongly connected components, iterative: the graph is deep
const component = new Map();
{
  const index = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  let next = 0;
  let count = 0;
  for (const root of Object.keys(graph)) {
    if (index.has(root)) continue;
    const work = [[root, 0]];
    index.set(root, next); low.set(root, next); next += 1;
    stack.push(root); onStack.add(root);
    while (work.length) {
      const frame = work.at(-1);
      const [node, i] = frame;
      const targets = graph[node] || [];
      if (i < targets.length) {
        frame[1] += 1;
        const target = targets[i];
        if (!index.has(target)) {
          index.set(target, next); low.set(target, next); next += 1;
          stack.push(target); onStack.add(target);
          work.push([target, 0]);
        } else if (onStack.has(target)) {
          low.set(node, Math.min(low.get(node), index.get(target)));
        }
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work.at(-1)[0];
        low.set(parent, Math.min(low.get(parent), low.get(node)));
      }
      if (low.get(node) === index.get(node)) {
        let member;
        do {
          member = stack.pop();
          onStack.delete(member);
          component.set(member, count);
        } while (member !== node);
        count += 1;
      }
    }
  }
}

const onCycle = [];
for (const [from, targets] of Object.entries(graph)) {
  for (const to of targets) {
    if (component.get(from) === component.get(to)) onCycle.push(`${from} -> ${to}`);
  }
}
onCycle.sort();
const cycles = result.circular();
if (list) {
  for (const cycle of cycles) console.log(`${cycle.join(' -> ')} -> ${cycle[0]}`);
}

if (update) {
  writeFileSync(BASELINE, onCycle.length ? `${onCycle.join('\n')}\n` : '');
  console.log(`Wrote ${onCycle.length} imports on a cycle to ${path.relative(appDir, BASELINE)}`);
  process.exit(0);
}

const baseline = new Set(readFileSync(BASELINE, 'utf8').split('\n').filter(Boolean));
const added = onCycle.filter(edge => !baseline.has(edge));
const gone = [...baseline].filter(edge => !onCycle.includes(edge));

// One way back from an import's target to its source: the cycle it closes
function cycleThrough(from, to) {
  const previous = new Map([[to, null]]);
  const queue = [to];
  while (queue.length) {
    const node = queue.shift();
    if (node === from) break;
    for (const target of graph[node] || []) {
      if (!previous.has(target) && component.get(target) === component.get(from)) {
        previous.set(target, node);
        queue.push(target);
      }
    }
  }
  const way = [];
  for (let node = from; node !== null; node = previous.get(node)) way.unshift(node);
  return [from, ...way];
}

for (const edge of added) {
  const [from, to] = edge.split(' -> ');
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error file=app/${from},title=New import cycle::${from} imports ${to}, which imports it back`);
  }
  console.log(`New import on a cycle: ${edge}\n  ${cycleThrough(from, to).join('\n  -> ')}`);
}
console.log(`${cycles.length} import cycles (madge), ${onCycle.length} imports on a cycle, ${added.length} not in the baseline.`);
if (gone.length) {
  console.log(`${gone.length} imports of the baseline are no longer on a cycle: run \`meteor npm run cycles -- --update\` to remove them from it.`);
}
process.exit(added.length ? 1 : 0);
