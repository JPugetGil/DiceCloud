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
import chroma from 'chroma-js';
import useReducedMotion from '/imports/ui/composables/useReducedMotion';
import { damageOf } from '/imports/ui/composables/useHealthChange';

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

const color = computed(() => {
  return props.model.color || theme.current.value.colors.primary;
});

const barColor = computed(() => {
  const fraction = props.model.value / props.model.total;
  if (!Number.isFinite(fraction)) return color.value;
  if (fraction > 0.5) {
    return color.value;
  } else if (props.model.healthBarColorMid && props.model.healthBarColorLow) {
    return chroma.mix(props.model.healthBarColorLow, props.model.healthBarColorMid, fraction * 2).hex();
  } else if (props.model.healthBarColorMid) {
    return props.model.healthBarColorMid;
  }
  return color.value;
});

// Without a maximum (0 / 0, nothing built yet), the track is a plain empty
// one: in a darker shade of the bar's colour it read as a full bar (D8)
const hasMaximum = computed(() => Number.isFinite(props.model.total) && props.model.total > 0);

const barBackgroundColor = computed(() => {
  if (!hasMaximum.value) return 'rgb(var(--v-theme-surface-light))';
  return chroma(barColor.value)
    .darken(1.5)
    .desaturate(1.5)
    .hex();
});
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
