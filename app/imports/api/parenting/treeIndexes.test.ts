import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import Docs from '/imports/api/docs/Docs';
import { SCHEMA_INDEXES, treeIndexesUpdated, updateTreeIndexes } from '/imports/api/parenting/treeIndexes';

/*
 * The tree collections' indexes (lot O, 2026-10-21): the tree index everywhere,
 * the library's own, and none of those they replace, on a new database as on
 * one built by the schemas' indexes (production's)
 */
const names = async (collection: Mongo.Collection<any>) =>
  (await collection.rawCollection().indexes()).map(index => index.name);
const keyOf = async (collection: Mongo.Collection<any>, name: string) =>
  (await collection.rawCollection().indexes()).find(index => index.name === name)?.key;

if (Meteor.isServer) describe('Tree indexes', function () {
  this.timeout(20000);

  it('gives every tree collection its tree index, and none of the schemas\' it replaces', async function () {
    await treeIndexesUpdated();
    for (const collection of [CreatureProperties, LibraryNodes, Docs]) {
      const name = collection.rawCollection().collectionName;
      assert.deepEqual(await keyOf(collection, 'root.id_1_left_1'), { 'root.id': 1, left: 1 }, name);
      for (const replaced of SCHEMA_INDEXES) assert.notInclude(await names(collection), replaced, name);
      // The soft removal's other indexes stay: the cleanup and the restore read them
      assert.includeMembers(await names(collection), ['c2_removedAt', 'c2_removedWith'], name);
    }
  });

  it('gives the libraries their own indexes, and no text index', async function () {
    await treeIndexesUpdated();
    const indexes = await LibraryNodes.rawCollection().indexes();
    const byName = Object.fromEntries(indexes.map(index => [index.name, index]));
    assert.deepEqual(byName['libraryTags_1_type_1']?.key, { libraryTags: 1, type: 1 });
    assert.deepEqual(byName['type_1_root.id_1']?.key, { type: 1, 'root.id': 1 });
    assert.deepEqual(byName['slotFillerType_1']?.partialFilterExpression, { slotFillerType: { $exists: true } });
    assert.deepEqual(byName['removed_root.id_1_left_1']?.partialFilterExpression, { removed: true });
    assert.isUndefined(byName['name_text_tags_text']);
    assert.notOk(indexes.some(index => index.key._fts), 'a text index');
  });

  it('replaces the schemas\' indexes of an existing database, once its own are built', async function () {
    const collection = new Mongo.Collection<any>('treeIndexesUpdate');
    const raw = collection.rawCollection();
    await raw.drop().catch(() => {});
    // As production has them: built by aldeed:schema-index, plus a text index
    for (const field of ['root.id', 'left', 'right', 'removed', 'removedAt']) {
      await raw.createIndex({ [field]: 1 }, { name: `c2_${field}` });
    }
    await raw.createIndex({ name: 'text' }, { name: 'name_text' });
    await raw.insertOne({ _id: 'doc', root: { id: 'root', collection: 'tests' }, left: 1, right: 2 });

    const options = { indexes: [{ key: { type: 1 } as const }], dropped: ['name_text'] };
    await updateTreeIndexes(collection, options);
    assert.sameMembers(await names(collection), ['_id_', 'c2_removedAt', 'root.id_1_left_1', 'type_1']);
    // Again, as at each startup: nothing to build, nothing to drop
    await updateTreeIndexes(collection, options);
    assert.sameMembers(await names(collection), ['_id_', 'c2_removedAt', 'root.id_1_left_1', 'type_1']);
    await raw.drop();
  });
});
