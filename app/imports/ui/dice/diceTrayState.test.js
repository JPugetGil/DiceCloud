import { assert } from 'chai';
import {
  setThrowPhase, throwPhase, wasThrown, endThrows, forgetThrows,
} from '/imports/ui/dice/diceTrayState';

describe('Dice tray throws (diceTrayState)', function () {
  afterEach(forgetThrows);

  it('knows the entries it threw and their phase', function () {
    assert.isFalse(wasThrown('a'));
    setThrowPhase('a', 'flying');
    assert.isTrue(wasThrown('a'));
    assert.equal(throwPhase('a'), 'flying');
    setThrowPhase('a', 'showing');
    assert.equal(throwPhase('a'), 'showing');
  });

  it('lets every waiting entry go when the tray stops', function () {
    setThrowPhase('a', 'flying');
    setThrowPhase('b', 'showing');
    endThrows();
    assert.equal(throwPhase('a'), 'done');
    assert.equal(throwPhase('b'), 'done');
    assert.isTrue(wasThrown('a'));
  });
});
