<template>
  <div
    class="bar"
    @click="e => $emit('click', e)"
  >
    <div
      style="width: 100%; position: relative; transition: background-color 0.5s ease;"
      :style="{
        backgroundColor: barBackgroundColor,
        height: `${height}px`,
      }"
    >
      <div
        class="filler"
        style="height: 100%; transform-origin: left; transition: all 0.5s ease;"
        :style="{
          backgroundColor: barColor,
          transform: `scaleX(${fillFraction})`,
        }"
      />
      <slot />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useTheme } from 'vuetify';
import chroma from 'chroma-js';

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

const fillFraction = computed(() => {
  let fraction = props.model.value / props.model.total;
  if (fraction < 0) fraction = 0;
  if (fraction > 1) fraction = 1;
  return fraction;
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

const barBackgroundColor = computed(() => {
  return chroma(barColor.value)
    .darken(1.5)
    .desaturate(1.5)
    .hex();
});
</script>