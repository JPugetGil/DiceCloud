import { assert } from 'chai';
import { isMotionReduced } from '/imports/ui/composables/useReducedMotion';

describe('Reduced animations (useReducedMotion)', function () {
  it('follows the system unless the account asks for reduced animations', function () {
    assert.isFalse(isMotionReduced(undefined, false));
    assert.isFalse(isMotionReduced({}, false));
    assert.isTrue(isMotionReduced({}, true));
    assert.isTrue(isMotionReduced({ reduceMotion: true }, false));
    assert.isTrue(isMotionReduced({ reduceMotion: true }, true));
  });

  it('ignores the old dice preference, moved over at startup', function () {
    assert.isFalse(isMotionReduced({ disableDiceAnimation: true }, false));
  });
});
