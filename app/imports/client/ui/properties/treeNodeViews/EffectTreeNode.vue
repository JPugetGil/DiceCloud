<template>
  <div class="d-flex flex-1-1 align-center justify-start">
    <v-icon
      v-if="!hideIcon"
      class="mr-2"
      :class="selected && 'text-primary'"
      :color="model.color"
    >
      {{ effectIcon }}
    </v-icon>
    <div
      class="text-no-wrap text-truncate"
    >
      <template v-if="model.name">
        {{ model.name }}
      </template>
      <template v-else-if="model.targetByTags">
        <span class="mr-1">
          {{ displayedValue }}
        </span>
        <span
          class="mr-1"
        >{{ displayedTags }}</span>
      </template>
      <template v-else>
        <span class="mr-1">
          {{ displayedValue }}
        </span>
        <span
          class="mr-1"
        >{{ displayedStats }}</span>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import getEffectIcon from '/imports/client/ui/utility/getEffectIcon';

const props = defineProps({
  model: {
    type: Object,
    default: () => ({}),
  },
  selected: Boolean,
  hideIcon: Boolean,
});

const resolvedValue = computed(() => {
  return (props.model.amount && props.model.amount.value) !== undefined ?
    props.model.amount.value : props.model.amount && props.model.amount.calculation;
});

const effectIcon = computed(() => {
  let value = resolvedValue.value;
  return getEffectIcon(props.model.operation, value);
});

const displayedValue = computed(() => {
  let value = resolvedValue.value;
  switch(props.model.operation) {
    case 'base': return value || 0;
    case 'add': return isFinite(value) ? Math.abs(value) : value || 0;
    case 'mul': return value;
    case 'min': return value;
    case 'max': return value;
    case 'advantage': return;
    case 'disadvantage': return;
    case 'passiveAdd': return isFinite(value) ? Math.abs(value) : value || 0;
    case 'fail': return;
    case 'conditional': return;
    default: return undefined;
  }
});

const displayedStats = computed(() => {
  if (!props.model.stats) return 'Selected stats';
  return props.model.stats.join(', ');
});

const displayedTags = computed(() => {
  if (!props.model.targetTags) return 'Selected tags';
  const tags = props.model.targetTags.join(', ');
  if (!props.model.extraTags) return tags;
  const extraTags = props.model.extraTags.map(ex => {
    return ` ${ex.operation} ${ex.tags.join(', ')}`
  }).join(' ');
  return tags + extraTags;
});
</script>
