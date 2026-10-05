import { ref, watch, onBeforeUnmount } from 'vue';
import useReducedMotion from '/imports/ui/composables/useReducedMotion';
import { DURATION } from '/imports/ui/utility/motion';

/**
 * A number that counts to its new value instead of jumping (DURATION.medium,
 * decelerating), for values that change under the user's eyes. With reduced
 * animations, or a value that is not a number, it jumps.
 */
export default function useTweenedNumber(source, duration = DURATION.medium) {
  const reducedMotion = useReducedMotion();
  const shown = ref(source());
  let frame;
  watch(source, (to, from) => {
    cancelAnimationFrame(frame);
    if (reducedMotion.value || !Number.isFinite(to) || !Number.isFinite(from)) {
      shown.value = to;
      return;
    }
    const begin = Number.isFinite(shown.value) ? shown.value : from;
    const start = performance.now();
    const step = now => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      shown.value = progress < 1 ? Math.round(begin + (to - begin) * eased) : to;
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  });
  onBeforeUnmount(() => cancelAnimationFrame(frame));
  return shown;
}
