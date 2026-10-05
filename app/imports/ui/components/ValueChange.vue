<template>
  <span
    class="value-change"
    :class="change && `value-change--active value-change--${change}`"
  ><slot /><span
    v-if="change"
    class="value-change__arrow"
    aria-hidden="true"
  >{{ change === 'up' ? '▲' : '▼' }}</span></span>
</template>

<script setup>
import useValueChange from '/imports/ui/composables/useValueChange';

/**
 * A value that the server may recalculate: tinted for a moment, with ▲ or ▼,
 * when it changes (A5, useValueChange). Only the tint and the arrow's opacity
 * change: nothing moves
 */
const props = defineProps({
  // The number to watch (what is shown is the slot)
  value: {
    type: Number,
    default: undefined,
  },
  // Which value it is: a property id, and which of its fields
  changeKey: {
    type: String,
    required: true,
  },
});

const change = useValueChange(() => props.value, () => props.changeKey);
</script>
