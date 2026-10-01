<template>
  <v-select
    v-bind="$attrs"
    :loading="loading"
    :error-messages="errors"
    :model-value="safeValue"
    :menu-props="{auto: true, lazy: true}"
    :disabled="isDisabled"
    variant="outlined"
    @update:model-value="select"
    @focus="focused = true"
    @blur="focused = false"
  >
    <template
      v-if="$slots.prepend"
      #prepend
    >
      <slot name="prepend" />
    </template>
    <template
      v-if="$slots['prepend-inner']"
      #prepend-inner
    >
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

// The select is controlled by safeValue, which follows the model only while it
// is not focused, and it keeps the focus after a pick: show the pick at once,
// or the previous option stays on screen until the select is left
function select(value) {
  safeValue.value = value;
  change(value);
}
</script>
