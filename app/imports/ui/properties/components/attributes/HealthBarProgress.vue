<template>
  <div
    class="bar"
    @click="e => $emit('click', e)"
  >
    <div
      class="bar__track"
      :style="{
        backgroundColor: barBackgroundColor,
        height: `${height}px`,
      }"
    >
      <!-- Keeps the value lost for a moment, then drains (DESIGN_SYSTEM.md, "Motion") -->
      <div
        class="bar__ghost"
        :style="{
          backgroundColor: barColor,
          transform: `scaleX(${fillFraction})`,
          transition: ghostTransition,
        }"
      />
      <div
        class="filler"
        :style="{
          backgroundColor: barColor,
          transform: `scaleX(${fillFraction})`,
          transition: fillTransition,
        }"
      />
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useTheme } from 'vuetify';
import useReducedMotion from '/imports/ui/composables/useReducedMotion';
import { damageOf } from '/imports/ui/composables/useHealthChange';
import healthBarColors from '/imports/ui/properties/components/attributes/healthBarColors';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  height: {
    type: Number,
    default: 24,
  },
});

defineEmits(['click']);

const theme = useTheme();
const reducedMotion = useReducedMotion();

const fillFraction = computed(() => {
  let fraction = props.model.value / props.model.total;
  // 0 / 0 (nothing built yet) is NaN, which drew a full bar
  if (!Number.isFinite(fraction)) return 0;
  if (fraction < 0) fraction = 0;
  if (fraction > 1) fraction = 1;
  return fraction;
});

/*
 * Damage: the bar drops at once and a ghost of what was lost stays a moment,
 * then drains. Healing: the ghost shows the new value at once and the bar
 * fills up to it. A change of the maximum alone just slides
 */
const change = ref('steady');
watch(() => [fillFraction.value, damageOf(props.model)], ([fraction, damage], [oldFraction, oldDamage]) => {
  if (damage === oldDamage) change.value = 'steady';
  else change.value = fraction < oldFraction ? 'down' : 'up';
});

const transform = (duration, delay = '0ms') => `transform var(--motion-duration-${duration}) var(--motion-easing-standard) ${delay}`;
const fillTransition = computed(() => {
  if (reducedMotion.value) return 'none';
  if (change.value === 'down') return transform('short');
  if (change.value === 'up') return transform('long');
  return transform('medium');
});
const ghostTransition = computed(() => {
  if (reducedMotion.value) return 'none';
  if (change.value === 'down') return transform('long', 'var(--motion-duration-long)');
  if (change.value === 'up') return 'none';
  return transform('medium');
});

const colors = computed(() => healthBarColors(props.model, theme.current.value.colors));
const barColor = computed(() => colors.value.bar);
const barBackgroundColor = computed(() => colors.value.track);
</script>

<style scoped>
.bar__track {
  position: relative;
  width: 100%;
  transition: background-color var(--motion-duration-long) var(--motion-easing-standard);
}

.filler,
.bar__ghost {
  position: absolute;
  inset: 0;
  transform-origin: left;
}

.bar__ghost {
  opacity: 0.5;
}
</style>
