<template>
  <div class="d-flex flex-1-1 align-center justify-start">
    <v-icon
      class="mr-2"
      :class="selected && 'text-primary'"
      :color="model.color"
    >
      {{ effectIcon }}
    </v-icon>
    <div
      class="tree-node-text"
    >
      <template v-if="model.name">
        {{ model.name }}
      </template>
      <template v-else-if="model.targetByTags">
        <span class="mr-1">
          {{ formatQuantity(displayedValue, unit) }}
        </span>
        <span
          class="mr-1"
        >{{ displayedTags }}</span>
      </template>
      <template v-else>
        <span class="mr-1">
          {{ formatQuantity(displayedValue, unit) }}
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
import getEffectIcon from '/imports/ui/utility/getEffectIcon';
import { effectDisplayedValue } from '/imports/ui/utility/effectDisplay';
import { useI18n } from 'vue-i18n';
import useUnits, { useEffectUnit } from '/imports/ui/composables/useUnits';

const { t } = useI18n();

const props = defineProps({
  model: {
    type: Object,
    default: () => ({}),
  },
  selected: Boolean,
});

// An amount in metres or kilograms is shown in the user's units
const { formatQuantity } = useUnits();
const unit = useEffectUnit(() => props.model);

const resolvedValue = computed(() => {
  return (props.model.amount && props.model.amount.value) !== undefined ?
    props.model.amount.value : props.model.amount && props.model.amount.calculation;
});

const effectIcon = computed(() => {
  let value = resolvedValue.value;
  return getEffectIcon(props.model.operation, value);
});

// An unresolved base or addition shows 0
const displayedValue = computed(() => {
  const operation = props.model.operation;
  const value = ['base', 'add', 'passiveAdd'].includes(operation) ? resolvedValue.value || 0 : resolvedValue.value;
  return effectDisplayedValue(operation, value);
});

const displayedStats = computed(() => {
  if (!props.model.stats) return t('treeNodes.selectedStats');
  return props.model.stats.join(', ');
});

const displayedTags = computed(() => {
  if (!props.model.targetTags) return t('treeNodes.selectedTags');
  const tags = props.model.targetTags.join(', ');
  if (!props.model.extraTags) return tags;
  const extraTags = props.model.extraTags.map(ex => {
    return ` ${ex.operation} ${ex.tags.join(', ')}`
  }).join(' ');
  return tags + extraTags;
});
</script>
