import { assert } from 'chai';
import {
  addObjectToUsage, getTopLevelPrefix, summarizeUsage, type PrefixUsage,
} from '/imports/api/files/bucketUsage';

describe('S3 bucket usage', function () {
  it('groups the objects by the first folder of their key', function () {
    assert.equal(getTopLevelPrefix('files/abc-original.png'), 'files/');
    assert.equal(getTopLevelPrefix('dicecloud-backups/2026/10/dump.gz'), 'dicecloud-backups/');
    assert.equal(getTopLevelPrefix('notes.txt'), '');
  });

  it('adds up the size and number of objects of each folder, largest first', function () {
    const usage = new Map<string, PrefixUsage>();
    addObjectToUsage(usage, 'files/a-original.png', 10);
    addObjectToUsage(usage, 'files/b-original.json', 5);
    addObjectToUsage(usage, 'dicecloud-backups/dump.gz', 100);
    addObjectToUsage(usage, 'notes.txt', 1);

    assert.deepEqual(summarizeUsage(usage.values()), {
      prefixes: [
        { prefix: 'dicecloud-backups/', bytes: 100, objectCount: 1 },
        { prefix: 'files/', bytes: 15, objectCount: 2 },
        { prefix: '', bytes: 1, objectCount: 1 },
      ],
      bytes: 116,
      objectCount: 4,
    });
  });

  it('is empty for an empty bucket', function () {
    assert.deepEqual(summarizeUsage([]), { prefixes: [], bytes: 0, objectCount: 0 });
  });
});
