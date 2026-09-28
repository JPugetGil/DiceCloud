<template>
  <v-combobox
    v-bind="$attrs"
    v-model:search="searchInput"
    :loading="loading"
    :error-messages="errors"
    :model-value="safeValue"
    :menu-props="{auto: true, lazy: true}"
    :disabled="isDisabled"
    :multiple="multiple"
    variant="outlined"
    @update:model-value="customChange"
    @focus="focused = true"
    @blur="focused = false"
  >
    <template #prepend>
      <slot

        name="prepend"
      />
    </template>
  </v-combobox>
</template>

<script setup>
import { ref } from 'vue';
import { useSmartInput, smartInputProps } from '/imports/client/ui/components/global/useSmartInput';

defineOptions({
  inheritAttrs: false,
});

const props = defineProps({
  ...smartInputProps,
  multiple: Boolean,
});

const emit = defineEmits(['input', 'change', 'update:modelValue']);

const searchInput = ref('');

const {
  loading,
  errors,
  safeValue,
  isDisabled,
  focused,
  input
} = useSmartInput(props, emit, {
  defaultDebounceTime: () => props.multiple ? 1000 : 100,
});

function customChange(val) {
  input(val);
  searchInput.value = '';
}
</script>
