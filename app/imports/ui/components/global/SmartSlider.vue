<template>
  <v-slider
    ref="inputRef"
    v-bind="$attrs"
    class="dc-text-field"
    :hide-details="!(errors && errors.length)"
    :error-messages="errors"
    :model-value="safeValue"
    :disabled="isDisabled || loading"
    :variant="!regular ? 'outlined' : undefined"
    @update:model-value="e => model = e"
    @end="e => { change(e); emit('end', e); }"
    @start="e => emit('start', e)"
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
      v-if="$slots.append"
      #append
    >
      <slot name="append" />
    </template>
  </v-slider>
</template>

<script setup>
import { ref } from 'vue';
import { useSmartInput, smartInputModel, smartInputProps, smartInputEmits } from '/imports/ui/composables/useSmartInput';

const props = defineProps({
  regular: Boolean,
  ...smartInputProps,
});

const model = defineModel(smartInputModel);

const emit = defineEmits([...smartInputEmits, 'end', 'start']);

const {
  errors,
  safeValue,
  isDisabled,
  loading,
  focused,
  change,
} = useSmartInput(props, model, emit);

const inputRef = ref(null);

function focus() {
  inputRef.value?.focus();
}

defineExpose({ focus });
</script>
