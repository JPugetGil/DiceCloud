import { assert } from 'chai';
import fc from 'fast-check';
import { execFileSync } from 'child_process';
import path from 'path';
import { readAppVersion } from '/imports/api/version/server/appVersion';

/*
 * The version read from the commits (deploy/version.sh): the script's rule,
 * against a model of it on random histories, and where the server reads it.
 */
// `meteor test` runs the server outside the clone: from where npm ran
const cwd = process.env.INIT_CWD || process.cwd();
const git = (...args: string[]) => execFileSync('git', args, { cwd }).toString().trim();
const root = () => git('rev-parse', '--show-toplevel');
/** The script's version after these commit subjects, oldest first */
const scriptVersion = (subjects: string[]) => execFileSync(
  'bash', [path.join(root(), 'deploy', 'version.sh'), '--subjects'], { input: subjects.join('\n') },
).toString().trim();

// A commit, as the model reads it: its subject is written from it
type Commit = { type: string, scope?: string, breaking: boolean, text: string };
const subjectOf = ({ type, scope, breaking, text }: Commit) =>
  `${type}${scope ? `(${scope})` : ''}${breaking ? '!' : ''}: ${text}`;

/** The rule, on the commits: "!" bumps the major, feat the minor, fix the patch */
function modelVersion(commits: (Commit | null)[]) {
  let [major, minor, patch] = [3, 0, 0];
  for (const commit of commits) {
    if (!commit) continue;
    if (commit.breaking) [major, minor, patch] = [major + 1, 0, 0];
    else if (commit.type.toLowerCase() === 'feat') [minor, patch] = [minor + 1, 0];
    else if (commit.type.toLowerCase() === 'fix') patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

// Some text on one line, as a subject is
const line = fc.string({ unit: 'grapheme', maxLength: 30 }).map(text => text.replace(/[\r\n\0]/g, ' '));
const commit: fc.Arbitrary<Commit> = fc.record({
  // The types in this repository's history, in their cases, and near misses
  type: fc.constantFrom('Feat', 'feat', 'FEAT', 'Fix', 'fix', 'Chore', 'Refactor', 'Test', 'Docs',
    'Fixed', 'Feature', 'Hotfix', 'Featfix'),
  scope: fc.option(fc.stringMatching(/^[a-z-]{1,10}$/), { nil: undefined }),
  // One commit in ten
  breaking: fc.nat(9).map(n => n === 0),
  text: line,
});
// A subject that is no "type:" at all: a merge, a sentence ("Fixed the
// tooltip"), a space before the colon; the model counts it as nothing
const other = fc.oneof(
  line.map(text => `Merge branch '${text}'`),
  line.map(text => `Fixed ${text}`),
  fc.constantFrom('fix : spaced', 'feat(scope : open', ' feat: indented', '(feat): bracketed'),
);
const history = fc.array(fc.oneof(
  { weight: 4, arbitrary: commit },
  { weight: 1, arbitrary: other.map(subject => ({ subject })) },
), { maxLength: 25 });

describe('The version read from the commits', function () {
  this.timeout(30000);

  it('follows the rule on examples', function () {
    assert.equal(scriptVersion([]), '3.0.0');
    assert.equal(scriptVersion(['Feat: a', 'Fix: b', 'fix(actions): c', 'Chore: d']), '3.1.2');
    assert.equal(scriptVersion(['Fix: a', 'Feat: b']), '3.1.0', 'a feature resets the patch');
    assert.equal(scriptVersion(['Feat: a', 'Feat!: b', 'Fix: c']), '4.0.1', 'a breaking change resets the rest');
    assert.equal(scriptVersion(['Fixed: a', 'Feature: b', 'Fixed the tooltip']), '3.0.0', 'near misses count for nothing');
  });

  it('agrees with the model on any history', function () {
    fc.assert(fc.property(history, entries => {
      const subjects = entries.map(entry => 'subject' in entry ? entry.subject : subjectOf(entry));
      const commits = entries.map(entry => 'subject' in entry ? null : entry);
      assert.equal(scriptVersion(subjects), modelVersion(commits), subjects.join('\n'));
    }), { numRuns: 60 });
  });

  it('takes the version the deployment gives, else the clone\'s', function () {
    assert.deepEqual(
      readAppVersion({ APP_VERSION: '3.4.1', CONTAINER_VERSION: 'abcdef12', APP_COMMIT_DATE: '2026-10-20T15:47:24+02:00' }),
      { version: '3.4.1', commit: 'abcdef12', date: '2026-10-20T15:47:24+02:00' },
    );
    const shallow = git('rev-parse', '--is-shallow-repository') === 'true';
    const fromClone = readAppVersion({}, cwd);
    // A shallow clone (the CI's) does not hold the history the script reads
    if (shallow) return assert.isNull(fromClone);
    assert.match(fromClone?.version ?? '', /^\d+\.\d+\.\d+$/);
    assert.match(fromClone?.commit ?? '', /^[0-9a-f]{8}$/);
    assert.isFalse(Number.isNaN(Date.parse(fromClone?.date ?? '')));
  });
});
