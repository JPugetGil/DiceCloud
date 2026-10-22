#!/usr/bin/env node
/**
 * Pulls public DiceCloud libraries over DDP into a JSON file for import.
 *
 *   node pull.js --library <id> [<id>...]   pull specific libraries
 *   node pull.js --collection <id>          resolve a library-collection (needs DC_TOKEN)
 *
 * Costs exactly two subscriptions per library: `library`, then `libraryNodes`
 * with the full field list from propertyFields.json (generated from this repo's
 * own property schemas). Asking for a field a document does not have is a no-op
 * in a Mongo projection, so no probing of the remote server is needed.
 *
 * dicecloud.com rate-limits DDP aggressively. Requests are paced, and a
 * "too many requests" rejection is retried after the delay the server asks for
 * -- it is never treated as a missing feature.
 *
 * Env:
 *   DC_TOKEN   Meteor resume token; only needed for --collection or private libraries
 *   DC_HOST    defaults to wss://dicecloud.com/websocket
 *   OUT        output file, defaults to ./libraries.json
 *   PACE       ms between requests (default 2500)
 *   RETRIES    attempts per request (default 5)
 */
const fs = require('fs');
const path = require('path');
const { connect, login } = require('./ddp');

const args = process.argv.slice(2);
const OUT = process.env.OUT || 'libraries.json';
const PACE = parseInt(process.env.PACE || '2500', 10);
const RETRIES = parseInt(process.env.RETRIES || '5', 10);

const FIELDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'propertyFields.json'), 'utf8'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...m) => console.log(...m);

const readMaybeGz = f => {
  const raw = fs.readFileSync(f);
  return f.endsWith('.gz') ? require('zlib').gunzipSync(raw).toString('utf8') : raw.toString('utf8');
};
const writeMaybeGz = (f, text) =>
  fs.writeFileSync(f, f.endsWith('.gz') ? require('zlib').gzipSync(text, { level: 6 }) : text);

const isRateLimit = e => /too many requests/i.test(e.message);
const waitFromError = e => {
  const m = e.message.match(/wait (\d+) seconds?/i);
  return m ? (parseInt(m[1], 10) + 1) * 1000 : 10000;
};

/** One paced, retrying subscription. Rate limits wait and retry; they never fall through. */
async function sub(conn, name, params, timeout) {
  for (let attempt = 1; ; attempt++) {
    try {
      await sleep(PACE);
      return await conn.sub(name, params, timeout);
    } catch (e) {
      if (isRateLimit(e) && attempt < RETRIES) {
        const w = waitFromError(e);
        log(`    rate limited on ${name}, waiting ${w / 1000}s (attempt ${attempt}/${RETRIES})`);
        await sleep(w);
        continue;
      }
      throw e;
    }
  }
}

// works for both the old (ancestors) and new (root) parenting formats
function rootIdOf(n) {
  if (n.root && n.root.id) return n.root.id;
  if (n.ancestors && n.ancestors.length) return n.ancestors[0].id;
  return undefined;
}

async function pullLibrary(conn, libraryId) {
  await sub(conn, 'library', [libraryId]);
  const library = (conn.store.libraries || {})[libraryId];
  if (!library) throw new Error(`library ${libraryId} not readable`);

  await sub(conn, 'libraryNodes', [libraryId, FIELDS], 180000);
  const nodes = conn.docs('libraryNodes').filter(n => rootIdOf(n) === libraryId);

  const contentful = nodes.filter(n => Object.keys(n).some(k => FIELDS.includes(k))).length;
  log(`  ${library.name}: ${nodes.length} nodes (${contentful} carrying property fields)`);
  return { library, nodes };
}

(async () => {
  const conn = connect(process.env.DC_HOST);
  await conn.ready;
  log('connected');

  if (process.env.DC_TOKEN) {
    const me = await login(conn, process.env.DC_TOKEN);
    log('logged in as', me.id);
  }

  let libraryIds = [];
  const ci = args.indexOf('--collection');
  const li = args.indexOf('--library');
  if (ci !== -1) {
    if (!process.env.DC_TOKEN) throw new Error('--collection requires DC_TOKEN');
    const colId = args[ci + 1];
    await sub(conn, 'libraryCollection', [colId]);
    const col = (conn.store.libraryCollections || {})[colId];
    if (!col) throw new Error('collection not readable');
    log(`collection "${col.name}" -> ${col.libraries.length} libraries`);
    libraryIds = col.libraries;
  } else if (li !== -1) {
    libraryIds = args.slice(li + 1).filter(a => !a.startsWith('--'));
  } else throw new Error('need --collection <id> or --library <id>...');

  // resume support: keep anything already pulled into OUT
  const out = fs.existsSync(OUT) ? JSON.parse(readMaybeGz(OUT)) : [];
  const done = new Set(out.map(o => o.library._id));
  const todo = libraryIds.filter(id => !done.has(id));
  if (done.size) log(`resuming: ${done.size} already in ${OUT}, ${todo.length} to go`);

  const failed = [];
  for (const [i, id] of todo.entries()) {
    log(`\n[${i + 1}/${todo.length}] ${id}`);
    try {
      out.push(await pullLibrary(conn, id));
      writeMaybeGz(OUT, JSON.stringify(out, null, 1)); // checkpoint after each
    } catch (e) {
      log(`  FAILED: ${e.message}`);
      failed.push(id);
    }
  }

  // references pointing outside the pulled set
  const have = new Set(out.map(o => o.library._id));
  const external = new Set();
  out.forEach(o => o.nodes.forEach(n => {
    const ext = n.cache && n.cache.library && n.cache.library.id;
    if (ext && !have.has(ext)) external.add(ext);
  }));

  log(`\nwrote ${OUT}: ${out.length} libraries, ${out.reduce((s, o) => s + o.nodes.length, 0)} nodes`);
  if (failed.length) log(`failed (re-run to retry): ${failed.join(' ')}`);
  if (external.size) {
    log(`\nWARNING: ${external.size} referenced librar${external.size === 1 ? 'y' : 'ies'} not in this pull:`);
    external.forEach(id => log('  ' + id));
  }
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
