import { assert } from 'chai';
import { healthBurst, damageOf, BURST_MS } from '/imports/ui/composables/useHealthChange';

describe('Health bar changes (useHealthChange)', function () {
  it('starts a burst at the first change: 7 damage is −7', function () {
    const burst = healthBurst(undefined, 0, 7, 1000);
    assert.deepEqual(burst, { baseline: 0, startedAt: 1000, delta: -7, isNew: true });
  });

  it('counts the simulation and the server\'s answer as one change', function () {
    // The client simulates 7 damage, the server writes 5 (temporary hit points took 2)
    const simulated = healthBurst(undefined, 0, 7, 1000);
    const answered = healthBurst(simulated, 7, 5, 1300);
    assert.equal(answered.delta, -5);
    assert.isFalse(answered.isNew);
    assert.equal(answered.startedAt, 1000);
  });

  it('shows nothing once a change is undone within the burst', function () {
    const burst = healthBurst(healthBurst(undefined, 3, 10, 0), 10, 3, 200);
    assert.equal(burst.delta, 0);
  });

  it('starts a new burst after BURST_MS: healing is +5', function () {
    const first = healthBurst(undefined, 0, 7, 0);
    const second = healthBurst(first, 7, 2, BURST_MS + 1);
    assert.deepEqual(second, { baseline: 7, startedAt: BURST_MS + 1, delta: 5, isNew: true });
  });

  it('ignores a change of the maximum alone (the damage stays)', function () {
    const burst = healthBurst(undefined, 0, 7, 0);
    assert.strictEqual(healthBurst(burst, 7, 7, 100), burst);
    assert.isUndefined(healthBurst(undefined, 4, 4, 0));
  });

  it('reads no damage as 0', function () {
    assert.equal(damageOf({ damage: null }), 0);
    assert.equal(damageOf(undefined), 0);
    assert.equal(damageOf({ damage: 3 }), 3);
  });
});
