import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import UserImages from '/imports/api/files/userImages/UserImages';
import ArchiveCreatureFiles from '/imports/api/creature/archive/ArchiveCreatureFiles';
import { imageTypeError } from '/imports/api/files/fileTypes';

/*
 * The files users upload are served back from the app's own address: what a
 * browser makes of one must never be the type the uploading client declared.
 * A "portrait.png" declared text/html, opened from a link, ran its script on
 * DiceCloud's origin, where the session's token is.
 */
type Collection = {
  onBeforeUpload: (this: { userId: string }, file: object) => Promise<true | string>,
  responseHeaders: (code: string, fileRef: object, versionRef: object, version: string) => Record<string, string>,
};
const images = UserImages as unknown as Collection;
const archives = ArchiveCreatureFiles as unknown as Collection;

if (Meteor.isServer) describe('Uploaded files: types', function () {
  it('accepts an image whose type and extension agree', function () {
    assert.isUndefined(imageTypeError({ type: 'image/png', extension: 'png' }));
    assert.isUndefined(imageTypeError({ type: 'image/jpeg', extension: 'JPG' }));
    assert.isUndefined(imageTypeError({ type: 'image/webp', extension: 'webp' }));
  });

  it('refuses any other type, or an extension of another type', function () {
    for (const file of [
      { type: 'text/html', extension: 'png' },
      { type: 'image/svg+xml', extension: 'png' },
      { type: 'image/png', extension: 'html' },
      { type: 'image/png', extension: 'png.html' },
      { type: 'image/png', extension: 'xpng' },
      { type: 'image/gif', extension: 'png' },
      { type: '', extension: 'png' },
    ]) {
      assert.isString(imageTypeError(file), JSON.stringify(file));
    }
  });

  it('refuses an image declared as a page, before anything else', async function () {
    const answer = await images.onBeforeUpload.call(
      { userId: 'nobody' }, { size: 10, name: 'portrait.png', extension: 'png', type: 'text/html' },
    );
    assert.isString(answer);
    assert.notEqual(answer, 'User not found', 'the type is checked first');
  });

  it('refuses an archive that is not a .json file', async function () {
    const answer = await archives.onBeforeUpload.call(
      { userId: 'nobody' }, { size: 10, name: 'archive.json.html', extension: 'html', type: 'text/html' },
    );
    assert.isString(answer);
    assert.notEqual(answer, 'User not found');
  });

  it('serves an image as an image only, never sniffed, and sandboxed', function () {
    const page = images.responseHeaders('200', {}, { type: 'text/html', size: 10 }, 'original');
    assert.equal(page['Content-Type'], 'application/octet-stream', 'a file stored as a page');
    assert.equal(page['X-Content-Type-Options'], 'nosniff');
    assert.equal(page['Content-Security-Policy'], 'sandbox');
    assert.equal(images.responseHeaders('200', {}, { type: 'image/png', size: 10 }, 'original')['Content-Type'], 'image/png');
    // ostrio:files' own headers stay: ranges and partial content
    assert.equal(images.responseHeaders('206', {}, { type: 'image/png', size: 10 }, 'original').Pragma, 'private');
    assert.equal(images.responseHeaders('416', {}, { type: 'image/png', size: 10 }, 'original')['Content-Range'], 'bytes */10');
  });

  it('serves an archive as JSON, whatever it was stored as', function () {
    const headers = archives.responseHeaders('200', {}, { type: 'text/html', size: 10 }, 'original');
    assert.equal(headers['Content-Type'], 'application/json');
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['Content-Security-Policy'], 'sandbox');
  });
});
