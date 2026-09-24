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
    @update:model-value="e => { emit('input', e); emit('update:modelValue', e); }"
    @end="e => { change(e); emit('end', e); }"
    @start="e => emit('start', e)"
    @focus="focused = true"
    @blur="focused = false"
  >
    <template #prepend>
      <slot name="prepend" />
    </template>
    <template #append>
      <slot name="append" />
    </template>
  </v-slider>
</template>

<script setup>
import { ref } from 'vue';
import { useSmartInput } from '/imports/client/ui/components/global/useSmartInput';

const props = defineProps({
  regular: Boolean,
  modelValue: {
    type: [String, Number, Date, Array, Object, Boolean],
    default: undefined,
  },
  value: {
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

const emit = defineEmits(['input', 'update:modelValue', 'change', 'end', 'start']);

const {
  errors,
  safeValue,
  isDisabled,
  loading,
  focused,
  change,
} = useSmartInput(props, emit);

const inputRef = ref(null);

function focus() {
  inputRef.value?.focus();
}

defineExpose({ focus });
</script>
