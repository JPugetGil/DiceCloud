<template>
  <v-switch
    v-bind="$attrs"
    :loading="loading"
    :error-messages="errors"
    :model-value="safeValue"
    :disabled="isDisabled"
    @update:model-value="change"
  />
</template>

<script setup>
import { useSmartInput } from '/imports/client/ui/components/global/useSmartInput';

defineOptions({
  inheritAttrs: false,
});

const props = defineProps({
  value: {
    type: [String, Number, Date, Array, Object, Boolean],
    default: undefined,
  },
  modelValue: {
    type: [String, Number, Date, Array, Object, Boolean],
    default: undefined,
  },
  errorMessages: {
    type: [String, Array],
    default: undefined,
  },
  disabled: Boolean,
  debounce: {
    type: Number,
    default: undefined,
  },
  rules: {
    type: Array,
    default: undefined,
  },
});

const emit = defineEmits(['update:modelValue', 'input', 'change']);

const {
  loading,
  errors,
  safeValue,
  isDisabled,
  change,
} = useSmartInput(props, emit);
</script>
