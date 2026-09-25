<template>
  <div class="d-flex flex-1-1 align-center justify-start">
    <property-icon
      v-if="!hideIcon"
      class="mr-2"
      :model="model"
      :class="selected && 'text-primary'"
      :color="model.color"
    />
    <div
      class="text-no-wrap text-truncate"
    >
      <template v-if="model.amount && model.amount.calculation">
        <span v-if="amount < 0">+</span>
        {{ absoluteAmount }} {{ model.stat }}
        <span v-if="typeof absoluteAmount === 'string' || amount >= 0">
          {{ $t('treeNodes.damageWord') }}
        </span>
        <span v-if="model.target === 'self'">
          {{ $t('treeNodes.toSelf') }}
        </span>
      </template>
      <template v-else>
        <span>{{ $t('treeNodes.attributeDamage', { stat: model.stat || $t('forms.attributeLabel') }) }}</span>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import PropertyIcon from '/imports/client/ui/properties/shared/PropertyIcon.vue';

const props = defineProps({
  model: {
    type: Object,
    default: () => ({}),
  },
  selected: Boolean,
  hideIcon: Boolean,
});

const amount = computed(() => {
  return props.model.amount && props.model.amount.value;
});

const absoluteAmount = computed(() => {
  if (typeof amount.value === 'number'){
    return Math.abs(amount.value);
  } else {
    return amount.value;
  }
});
</script>
