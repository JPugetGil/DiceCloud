import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import Docs, { insertDoc, organizeDoc, restoreDoc, softRemoveDoc, updateDoc } from '/imports/api/docs/Docs';

/*
 * The documentation's editing methods: for docs writers only, which change
 * what the editor shows (name, link, text, icon, publication) and never the
 * tree nor the links themselves but through their methods.
 */
const [writerId, playerId] = [Random.id(), Random.id()];
const tag = Random.id(6).toLowerCase();
const as = (method: unknown, userId: string, args: object) =>
  (method as { _execute(invocation: { userId: string }, args: unknown): Promise<any> })._execute({ userId }, args);
async function refusal(call: () => Promise<unknown>) {
  try {
    await call();
  } catch (error) {
    return error as { error?: string, message?: string };
  }
  assert.fail('not refused');
}
const inserted: string[] = [];
// The soft removal's fields, which the Doc type leaves out
const removed = async (_id: string) => ((await Docs.findOneAsync(_id)) as { removed?: boolean } | undefined)?.removed;
async function newDoc(parentId?: string) {
  const _id = await as(insertDoc, writerId, { doc: { name: 'New' }, parentId });
  inserted.push(_id);
  return _id as string;
}

if (Meteor.isServer) describe('Docs methods', function () {
  this.timeout(10000);

  before(async function () {
    await Meteor.users.insertAsync({ _id: writerId, username: `writer-${tag}`, roles: ['docsWriter'] });
    await Meteor.users.insertAsync({ _id: playerId, username: `player-${tag}`, roles: ['player'] });
  });

  after(async function () {
    await Docs.removeAsync({ _id: { $in: inserted } });
    await Meteor.users.removeAsync({ _id: { $in: [writerId, playerId] } });
  });

  it('are for docs writers only', async function () {
    const docId = await newDoc();
    const count = await Docs.find().countAsync();
    assert.match(String(await refusal(() => as(insertDoc, playerId, { doc: { name: 'Mine' } }))), /Permission denied/);
    await refusal(() => as(updateDoc, playerId, { _id: docId, path: ['name'], value: 'Changed' }));
    await refusal(() => as(softRemoveDoc, playerId, { _id: docId }));
    await refusal(() => as(organizeDoc, playerId, { docId, newPosition: 0.5 }));
    assert.equal(await Docs.find().countAsync(), count);
    assert.equal((await Docs.findOneAsync(docId))?.name, 'New');
    assert.notOk(await removed(docId));
  });

  it('insert a doc in the documentation\'s tree, with a link of its own', async function () {
    const parentId = await newDoc();
    const childId = await newDoc(parentId);
    const [parent, child] = [await Docs.findOneAsync(parentId), await Docs.findOneAsync(childId)];
    assert.equal(child?.parentId, parentId);
    assert.isTrue(parent!.left < child!.left && child!.right < parent!.right);
    assert.notEqual(child?.href, parent?.href);
  });

  it('change a doc\'s link with its name in the address, refusing one taken', async function () {
    const parentId = await newDoc();
    const childId = await newDoc(parentId);
    await as(updateDoc, writerId, { _id: parentId, path: ['urlName'], value: `parent-${tag}` });
    await as(updateDoc, writerId, { _id: childId, path: ['urlName'], value: `child-${tag}` });
    assert.equal((await Docs.findOneAsync(childId))?.href, `/docs/parent-${tag}/child-${tag}`);
    const otherId = await newDoc(parentId);
    const error = await refusal(() => as(updateDoc, writerId, { _id: otherId, path: ['urlName'], value: `child-${tag}` }));
    assert.equal(error.error, 'Link collision');
  });

  it('change only what the editor shows', async function () {
    const docId = await newDoc();
    const otherId = await newDoc();
    await as(updateDoc, writerId, { _id: docId, path: ['description'], value: 'Text' });
    assert.equal((await Docs.findOneAsync(docId))?.description, 'Text');
    // An empty value unsets the field
    await as(updateDoc, writerId, { _id: docId, path: ['description'], value: null });
    assert.notProperty(await Docs.findOneAsync(docId), 'description');
    const before = await Docs.findOneAsync(docId);
    for (const [path, value] of [
      [['parentId'], otherId], [['href'], '/docs/elsewhere'], [['left'], 0], [['root', 'id'], 'elsewhere'], [['$where'], 'x'],
    ] as const) {
      await refusal(() => as(updateDoc, writerId, { _id: docId, path, value }));
    }
    const after = await Docs.findOneAsync(docId);
    assert.deepEqual(
      { parentId: after?.parentId, href: after?.href, left: after?.left, root: after?.root },
      { parentId: before?.parentId, href: before?.href, left: before?.left, root: before?.root },
    );
  });

  it('remove a doc with its children, and restore them', async function () {
    const parentId = await newDoc();
    const childId = await newDoc(parentId);
    await as(softRemoveDoc, writerId, { _id: parentId });
    assert.isTrue(await removed(childId));
    await as(restoreDoc, writerId, { _id: parentId });
    assert.notOk(await removed(parentId));
    assert.notOk(await removed(childId));
  });
});
