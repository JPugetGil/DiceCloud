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
import { smartInputProps, useSmartInput } from '/imports/client/ui/components/global/useSmartInput';

defineOptions({
  inheritAttrs: false,
});

const props = defineProps(smartInputProps);

const emit = defineEmits(['input', 'change', 'update:modelValue']);

const { loading, errors, safeValue, isDisabled, change } = useSmartInput(props, emit);
</script>
