/**
 * Minimal step runner: each step passes when it throws nothing and the page
 * logged no console error or warning while it ran. A step may return a string,
 * printed under it as detail; an error may carry `details`, a list of lines
 * printed under it. The script exits non-zero if any step failed, so
 * `run-all.js` and CI can tell.
 */
function createChecker(title) {
  const failures = [];
  console.log(`\n${title}`);

  async function step(name, messages, fn) {
    if (messages) messages.length = 0;
    let error, detail, details = [];
    try {
      detail = await fn();
    } catch (e) {
      error = String(e && e.message || e).split('\n')[0];
      details = (e && e.details) || [];
    }
    const logged = messages ? [...new Set(messages)] : [];
    const ok = !error && !logged.length;
    console.log(`  ${ok ? '✓' : '✗'} ${name}${error ? ` — ${error}` : ''}`);
    if (typeof detail === 'string') console.log(`      ${detail}`);
    for (const line of details) console.log(`      ${line}`);
    for (const m of logged) console.log(`      ${m}`);
    if (!ok) failures.push(name);
    return ok;
  }

  function finish() {
    console.log(failures.length ? `  ${failures.length} failed` : '  all passed');
    process.exitCode = failures.length ? 1 : 0;
  }

  return { step, finish };
}

/** Run a check script's main function, turning a crash into a failure */
function main(fn) {
  fn().catch(e => {
    console.error(`  ✗ ${String(e && e.message || e).split('\n')[0]}`);
    process.exitCode = 1;
  });
}

module.exports = { createChecker, main };
