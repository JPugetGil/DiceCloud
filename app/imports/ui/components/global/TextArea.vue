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
import { useSmartInput, smartInputProps, smartInputEmits } from '/imports/ui/composables/useSmartInput';

defineOptions({
  inheritAttrs: false,
});

const props = defineProps({
  autoGrow: {
    type: Boolean,
    default: false,
  },
  ...smartInputProps,
});

const emit = defineEmits(smartInputEmits);

const {
  loading,
  errors,
  safeValue,
  isDisabled,
  input,
  focused
} = useSmartInput(props, emit);
</script>
