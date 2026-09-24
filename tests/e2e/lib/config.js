/**
 * Where the checks run, as whom, and the guards that keep them away from real
 * data. Every value can be overridden with an environment variable.
 */
const path = require('path');

const BASE_URL = (process.env.E2E_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
// The database of `meteor run`, read to find test data (never written to)
const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:3001/meteor';
const USERNAME = process.env.E2E_USERNAME || 'e2e-tester';
const PASSWORD = process.env.E2E_PASSWORD || 'e2e-tester-password';
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/**
 * Refuse to run against anything but a local development server, or as an
 * account that is not a dedicated test account: the checks sign in, create
 * characters and properties, and change account preferences.
 */
function assertSafeTarget() {
  const allowRemote = process.env.E2E_ALLOW_REMOTE === '1';
  const appHost = new URL(BASE_URL).hostname;
  const dbHost = MONGO_URL.replace(/^mongodb(\+srv)?:\/\/([^@/]*@)?/, '').split(/[:/,]/)[0];
  if (!allowRemote && !LOCAL_HOSTS.includes(appHost)) {
    throw new Error(`E2E_BASE_URL points at ${appHost}, not a local server. Set E2E_ALLOW_REMOTE=1 if that is intended.`);
  }
  if (!allowRemote && !LOCAL_HOSTS.includes(dbHost)) {
    throw new Error(`MONGO_URL points at ${dbHost}, not a local database. Set E2E_ALLOW_REMOTE=1 if that is intended.`);
  }
  if (!USERNAME.startsWith('e2e-')) {
    throw new Error(`E2E_USERNAME must start with "e2e-" (got "${USERNAME}"): only dedicated test accounts are used.`);
  }
}

module.exports = { BASE_URL, MONGO_URL, USERNAME, PASSWORD, OUTPUT_DIR, assertSafeTarget };
