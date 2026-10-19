import applyFnToKey, { applyFnToKeyAsync } from './applyFnToKey';
import { assert } from 'chai';
import { get } from 'lodash';

describe('apply function to key', function () {
  it('uses a basic key correctly', function () {
    let obj = getStartingObject();
    applyFnToKey(obj, 'fox.name', (doc, key) => {
      assert.equal(obj, doc);
      assert.equal(key, 'fox.name');
      assert.equal(get(doc, key), 'foxy');
    });
  });
  it('uses a single nested key correctly', function () {
    let obj = getStartingObject();
    let foxSounds = [];
    applyFnToKey(obj, 'fox.sound.$', (doc, key) => {
      foxSounds.push(get(doc, key));
    });
    assert.include(foxSounds, 'wah');
    assert.include(foxSounds, 'tjoef');
    assert.include(foxSounds, 'kek');
  });
  it('uses a double nested key correctly', function () {
    let obj = getStartingObject();
    let birdSounds = [];
    applyFnToKey(obj, 'birds.$.sound.$', (doc, key) => {
      birdSounds.push(get(doc, key));
    });
    assert.include(birdSounds, 'koer');
    assert.include(birdSounds, 'hello');
    assert.include(birdSounds, 'squawk');
  });
  // An element without the nested array stopped the whole traversal: the
  // elements after it were never reached
  it('goes on past an element without the nested array', async function () {
    const obj = getStartingObject();
    obj.birds.unshift(/** @type {any} */ ({ name: 'mute swan' }));
    const birdSounds = [];
    applyFnToKey(obj, 'birds.$.sound.$', (doc, key) => {
      birdSounds.push(get(doc, key));
    });
    assert.sameMembers(birdSounds, ['koer', 'hello', 'cracker?', 'squawk']);
    const asyncSounds = [];
    await applyFnToKeyAsync(obj, 'birds.$.sound.$', async (doc, key) => {
      asyncSounds.push(get(doc, key));
    });
    assert.sameMembers(asyncSounds, ['koer', 'hello', 'cracker?', 'squawk']);
  });
});

function getStartingObject() {
  return {
    fox: {
      name: 'foxy',
      sound: [
        'tjoef',
        'kek',
        'wah'
      ]
    },
    birds: [{
      name: 'pigeon',
      sound: [
        'koer',
      ]
    }, {
      name: 'parrot',
      sound: [
        'hello',
        'cracker?',
        'squawk',
      ]
    }]
  }
}
