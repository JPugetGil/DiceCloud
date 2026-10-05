import { ref, watch } from 'vue';

/**
 * How long changes to a health bar count as one: the value the client
 * simulates and the one the server writes back, or a hit and the temporary
 * hit points it went through, show as a single "−7".
 */
export const BURST_MS = 1500;

/**
 * The burst a health bar's damage change belongs to: a new one, or the one in
 * progress if it started less than BURST_MS ago. `delta` is the change of its
 * value since the burst started (damage taken is negative).
 */
export function healthBurst(burst, previousDamage, damage, now) {
  if (damage === previousDamage) return burst;
  if (!burst || now - burst.startedAt > BURST_MS) {
    return { baseline: previousDamage, startedAt: now, delta: previousDamage - damage, isNew: true };
  }
  return { ...burst, delta: burst.baseline - damage, isNew: false };
}

export const damageOf = model => model?.damage || 0;

/**
 * The change of a health bar the user should see: `delta` (−7, +5) and
 * `changeKey`, which grows with each new burst. Only damage and healing count:
 * the maximum changing alone shows nothing.
 */
export default function useHealthChange(getModel) {
  const delta = ref(0);
  const changeKey = ref(0);
  let burst;
  watch(() => damageOf(getModel()), (damage, previousDamage) => {
    burst = healthBurst(burst, previousDamage, damage, Date.now());
    delta.value = burst.delta;
    if (burst.isNew) changeKey.value += 1;
  });
  return { delta, changeKey };
}
