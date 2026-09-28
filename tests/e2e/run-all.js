#!/usr/bin/env node
/**
 * Runs every check in turn, each in its own process, and exits non-zero if any
 * failed. Pass check names to run only those: `node run-all.js routes flows`.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const CHECKS = ['routes', 'flows', 'actions', 'docs-navigation', 'property-forms', 'dialogs', 'login-services', 'contrast',
  'palette', 'accessibility', 'slot-fill'];

const selected = process.argv.slice(2).length ? process.argv.slice(2) : CHECKS;
const unknown = selected.filter(name => !CHECKS.includes(name));
if (unknown.length) {
  console.error(`unknown check(s): ${unknown.join(', ')}; available: ${CHECKS.join(', ')}`);
  process.exit(2);
}

const failed = selected.filter(name => spawnSync(process.execPath, [path.join(__dirname, 'checks', `${name}.js`)],
  { stdio: 'inherit', env: process.env }).status !== 0);

console.log(`\n${selected.length - failed.length} of ${selected.length} checks passed${failed.length ? `; failed: ${failed.join(', ')}` : ''}`);
process.exitCode = failed.length ? 1 : 0;
