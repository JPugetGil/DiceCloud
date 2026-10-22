#!/usr/bin/env node
/**
 * Regenerates propertyFields.json: the field names pull.js asks the remote's
 * `libraryNodes` publication for (its `extraFields` parameter).
 *
 *   node propertyFields.js           write propertyFields.json, print what changed
 *   node propertyFields.js --check   print what would change, write nothing
 *                                    (exit code 1 when the file is stale)
 *
 * The names are the top-level keys of every schema definition under
 * app/imports/api/properties (subSchemas included), app/imports/api/parenting
 * and app/imports/api/library: the object literals given to
 * `createPropertySchema(...)`, `TypedSimpleSchema.from(...)`,
 * `new SimpleSchema(...)`, `new TypedSimpleSchema(...)` and `.extend(...)`.
 * A dotted key ('extraTags.$.tags') counts by its first segment. Method
 * argument schemas (`new SimpleSchema({...}).validator()`) are left out.
 *
 * The files are parsed with the TypeScript compiler borrowed from
 * app/node_modules, so indentation and nesting do not matter. The regex this
 * replaces (until 2026-10-05) read only keys indented by exactly two spaces:
 * it missed every field of Spells.ts (indented by four inside
 * `.extend(TypedSimpleSchema.from({...}))`) and of the subSchemas folder, so
 * no pulled spell had a school, casting time, range or components.
 *
 * Asking for a field a document lacks is a no-op in a Mongo projection, so a
 * name too many costs nothing; a name too few loses that field for every node.
 */
const fs = require('fs');
const path = require('path');

const ts = require(process.env.TYPESCRIPT_PATH
  || path.join(__dirname, '../../app/node_modules/typescript'));

const API = path.join(__dirname, '../../app/imports/api');
const OUT = path.join(__dirname, 'propertyFields.json');
const SOURCES = [
  { dir: 'properties', recursive: true },
  { dir: 'parenting', recursive: false },
  { dir: 'library', recursive: false },
];

function sourceFiles(dir, recursive) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) files.push(...sourceFiles(full, recursive));
    } else if (/\.(js|ts)$/.test(entry.name) && !/\.test\.(js|ts)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

// Is this call or `new` expression one that takes a schema definition?
function isSchemaCall(node) {
  const callee = node.expression;
  if (ts.isNewExpression(node)) {
    return ts.isIdentifier(callee) && /^(SimpleSchema|TypedSimpleSchema)$/.test(callee.text);
  }
  if (ts.isIdentifier(callee)) return callee.text === 'createPropertySchema';
  if (ts.isPropertyAccessExpression(callee)) {
    const name = callee.name.text;
    if (name === 'extend') return true;
    return name === 'from' && ts.isIdentifier(callee.expression)
      && callee.expression.text === 'TypedSimpleSchema';
  }
  return false;
}

// `new SimpleSchema({...}).validator()`: a method's arguments, not a document
function isMethodArguments(node) {
  const parent = node.parent;
  return parent && ts.isPropertyAccessExpression(parent) && parent.name.text === 'validator';
}

function keysOf(file) {
  const text = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const keys = new Set();
  const visit = node => {
    if ((ts.isCallExpression(node) || ts.isNewExpression(node))
      && isSchemaCall(node) && !isMethodArguments(node)) {
      for (const arg of node.arguments || []) {
        if (!ts.isObjectLiteralExpression(arg)) continue;
        for (const prop of arg.properties) {
          // Computed keys ([`${field}.value`]) extend a field named elsewhere
          if (!prop.name || ts.isComputedPropertyName(prop.name)) continue;
          if (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) {
            keys.add(prop.name.text.split('.')[0]);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return keys;
}

const fields = new Set();
for (const { dir, recursive } of SOURCES) {
  for (const file of sourceFiles(path.join(API, dir), recursive)) {
    for (const key of keysOf(file)) fields.add(key);
  }
}
const next = [...fields].sort();
const previous = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
const added = next.filter(key => !previous.includes(key));
const removed = previous.filter(key => !next.includes(key));

console.log(`${next.length} fields (${previous.length} before)`);
if (added.length) console.log(`added (${added.length}): ${added.join(' ')}`);
if (removed.length) console.log(`removed (${removed.length}): ${removed.join(' ')}`);
if (process.argv.includes('--check')) {
  if (added.length || removed.length) process.exitCode = 1;
} else if (added.length || removed.length) {
  fs.writeFileSync(OUT, JSON.stringify(next, null, 1) + '\n');
  console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
}
