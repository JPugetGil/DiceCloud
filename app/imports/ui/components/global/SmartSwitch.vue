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
  change,
} = useSmartInput(props, model, emit);
</script>
