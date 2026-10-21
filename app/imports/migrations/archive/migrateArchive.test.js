import { assert } from 'chai';
import migrateArchive from '/imports/migrations/archive/migrateArchive';

// A character archived by DiceCloud 1 (schema version 1), as restoring the
// file migrates it: its old types, its calculations as strings, with `$` and
// `.value`/`.currentValue`, its tree by ancestors
const creatureRef = { collection: 'creatures', id: 'creature1' };
/** @returns {any} */
const version1Archive = () => ({
  meta: { schemaVersion: 1 },
  properties: [
    {
      _id: 'bite', type: 'attack', name: 'Bite', summary: 'Deals {$level} damage',
      ancestors: [creatureRef], parent: creatureRef, order: 1,
    },
    {
      _id: 'strength', type: 'attribute', name: 'Strength', variableName: 'strength', attributeType: 'ability',
      baseValue: 'dexterity.currentValue + $level', description: 'Above {strength.value}',
      ancestors: [creatureRef, { collection: 'creatureProperties', id: 'bite' }],
      parent: { collection: 'creatureProperties', id: 'bite' }, order: 2,
    },
    { _id: 'feat', type: 'slotFiller', name: 'Feat', ancestors: [creatureRef], parent: creatureRef, order: 3 },
    {
      _id: 'feats', type: 'propertySlot', name: 'Feats', slotType: 'slotFiller', slotTags: [],
      ancestors: [creatureRef], parent: creatureRef, order: 4,
    },
  ],
});

describe('Archive migrations', function () {
  it('brings a version 1 character to the current schema', function () {
    const archive = version1Archive();
    // A step that fails only warns: none may
    const warnings = [];
    const warn = console.warn;
    console.warn = (...args) => warnings.push(args);
    try {
      migrateArchive(archive);
    } finally {
      console.warn = warn;
    }
    assert.deepEqual(warnings, []);
    const byId = Object.fromEntries(archive.properties.map(prop => [prop._id, prop]));
    // Attacks are actions, slot fillers folders, and slots of them slots of folders
    assert.equal(byId.bite.type, 'action');
    assert.equal(byId.feat.type, 'folder');
    assert.equal(byId.feats.slotType, 'folder');
    // Calculations: `$` is `~`, `.value` is `.total` and `.currentValue` `.value`
    assert.equal(byId.strength.baseValue?.calculation, 'dexterity.value + ~level');
    assert.equal(byId.strength.description?.text, 'Above {strength.total}');
    assert.equal(byId.bite.summary?.text, 'Deals {~level} damage');
    // The tree, by root and parent
    assert.deepEqual(byId.strength.root, creatureRef);
    assert.equal(byId.strength.parentId, 'bite');
    assert.notProperty(byId.bite, 'parentId');
    // Cleaned: the old tree's fields are gone
    assert.notProperty(byId.strength, 'ancestors');
  });

  it('refuses an archive of an unknown version', function () {
    assert.throws(() => migrateArchive({ meta: { schemaVersion: 7 }, properties: [] }), /not supported/);
  });
});
