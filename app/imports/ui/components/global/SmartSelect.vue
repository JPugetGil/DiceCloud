<template>
  <v-select
    v-bind="$attrs"
    :loading="loading"
    :error-messages="errors"
    :model-value="safeValue"
    :menu-props="{auto: true, lazy: true}"
    :disabled="isDisabled"
    variant="outlined"
    @update:model-value="change"
    @focus="focused = true"
    @blur="focused = false"
  >
    <template #prepend>
      <slot name="prepend" />
    </template>
    <template #prepend-inner>
      <slot name="prepend-inner" />
    </template>
  </v-select>
</template>

<script setup>
import { useSmartInput, smartInputModel, smartInputProps, smartInputEmits } from '/imports/ui/composables/useSmartInput';

const props = defineProps(smartInputProps);
const model = defineModel(smartInputModel);

const emit = defineEmits(smartInputEmits);

const {
  loading,
  errors,
  safeValue,
  isDisabled,
  change,
  focused,
} = useSmartInput(props, model, emit);
</script>
