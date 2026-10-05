<template>
  <v-textarea
    v-bind="$attrs"
    :loading="loading"
    :error-messages="errors"
    :model-value="safeValue"
    :disabled="isDisabled"
    variant="outlined"
    @update:model-value="input"
    @focus="focused = true"
    @blur="focused = false"
  />
</template>

<script setup>
import { useSmartInput, smartInputModel, smartInputProps, smartInputEmits } from '/imports/ui/composables/useSmartInput';

defineOptions({
  inheritAttrs: false,
});

const props = defineProps({
  ...smartInputProps,
});

const model = defineModel(smartInputModel);

const emit = defineEmits(smartInputEmits);

const {
  loading,
  errors,
  safeValue,
  isDisabled,
  input,
  focused
} = useSmartInput(props, model, emit);
</script>
