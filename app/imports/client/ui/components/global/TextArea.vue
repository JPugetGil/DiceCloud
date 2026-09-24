<template>
  <v-textarea
    v-bind="$attrs"
    :loading="loading"
    :error-messages="errors"
    :model-value="safeValue"
    :disabled="isDisabled"
    :auto-grow="autoGrow"
    variant="outlined"
    @update:model-value="input"
    @focus="focused = true"
    @blur="focused = false"
  />
</template>

<script setup>
import { useSmartInput } from '/imports/client/ui/components/global/useSmartInput';

defineOptions({
  inheritAttrs: false,
});

const props = defineProps({
  autoGrow: {
    type: Boolean,
    default: false,
  },
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

const emit = defineEmits(['input', 'update:modelValue', 'change']);

const {
  loading,
  errors,
  safeValue,
  isDisabled,
  input,
  focused
} = useSmartInput(props, emit);
</script>
