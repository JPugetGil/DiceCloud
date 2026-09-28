<template>
  <v-checkbox
    v-bind="$attrs"
    :loading="loading"
    :error-messages="errors"
    :model-value="safeValue"
    :disabled="isDisabled"
    @update:model-value="change"
  />
</template>

<script setup>
import { smartInputProps, smartInputEmits, useSmartInput } from '/imports/ui/composables/useSmartInput';

defineOptions({
  inheritAttrs: false,
});

const props = defineProps(smartInputProps);

const emit = defineEmits(smartInputEmits);

const { loading, errors, safeValue, isDisabled, change } = useSmartInput(props, emit);
</script>
