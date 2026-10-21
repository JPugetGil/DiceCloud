import { assert } from 'chai';
import en from '/imports/ui/i18n/en.json';
import fr from '/imports/ui/i18n/fr.json';
import storedLogKeys from '/imports/api/creature/log/storedLogKeys.json';

/*
 * The log's messages are stored: each line keeps its message keys and their
 * parameters by name (logMessages.ts), and the log translates them when it
 * shows them. So a key, once written, has to stay, with the same parameters:
 * a missing key shows as itself ("logs.onHit"), a renamed parameter as
 * "{target}". storedLogKeys.json lists them with their parameters; the code
 * can only write keys of en.json (LogKey).
 */
const placeholders = (message: unknown) => typeof message === 'string'
  ? [...new Set(message.match(/\{(\w+)\}/g) ?? [])].map(name => name.slice(1, -1)).sort()
  : undefined;
const contract = storedLogKeys as Record<string, string[]>;

describe('Stored log messages', function () {
  it('keeps every key a log may hold, with the parameters it was written with', function () {
    const broken: string[] = [];
    for (const [key, params] of Object.entries(contract)) {
      const name = key.replace(/^logs\./, '') as keyof typeof en.logs;
      for (const [language, messages] of [['en', en.logs], ['fr', fr.logs]] as const) {
        const found = placeholders((messages as Record<string, unknown>)[name]);
        if (!found) broken.push(`${language} ${key}: missing`);
        else if (found.join() !== params.join()) broken.push(`${language} ${key}: {${found}} instead of {${params}}`);
      }
    }
    assert.deepEqual(broken, []);
  });

  it('lists every message of the log', function () {
    const unlisted = Object.keys(en.logs).map(name => `logs.${name}`).filter(key => !(key in contract));
    assert.deepEqual(unlisted, [], 'add them to storedLogKeys.json: once a log holds one, it has to stay');
  });
});
