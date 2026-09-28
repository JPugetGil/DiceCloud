<template>
  <div
    class="computed-field"
    :class="$attrs.class"
    :style="$attrs.style"
  >
    <text-field
      :model-value="model.calculation"
      v-bind="{ ...$attrs, class: undefined, style: undefined }"
      @change="(value, ack) => $emit('change', {path: ['calculation'], value, ack})"
    >
      <template
        v-if="showValue"
        #value
      >
        {{ displayedValue }}
      </template>
      <template #prepend>
        <slot name="prepend" />
      </template>
    </text-field>
    <calculation-error-list :errors="errorList" />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import CalculationErrorList from '/imports/ui/properties/forms/shared/CalculationErrorList.vue';

// The field's attributes (label, prefix, hint...) belong to the text field;
// only class and style lay out the wrapper. Inherited, they all landed on the
// div too, and a prefix there throws: Element.prefix is read-only
defineOptions({
  inheritAttrs: false,
});

const props = defineProps({
  model: {
    type: Object,
    default: () => ({}),
  },
  hideValue: {
    type: Boolean,
  },
});

defineEmits(['change']);

const displayedValue = computed(() => {
  // Use the unaffected value instead if the calculation has it, because effects can modify the value
  if (props.model?.unaffected !== undefined) {
    return props.model.unaffected;
  }
  return props.model?.value;
});

const showValue = computed(() => {
  let value = displayedValue.value;
  if (
    props.hideValue || 
    (value === undefined || value === null) ||
    value == props.model?.calculation
  ) return false;
  return true;
});

const errorList = computed(() => {
  if (props.model?.parseError) {
    return [props.model.parseError, ...(props.model.errors || [])];
  } else {
    return props.model?.errors;
  }
});
</script>

<style lang="css" scoped>
</style>
