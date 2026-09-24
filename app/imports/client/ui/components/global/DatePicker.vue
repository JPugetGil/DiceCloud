<template>
  <v-menu
    v-model="menu"
    :close-on-content-click="false"
    transition="scale-transition"
    min-width="290px"
  >
    <template #activator="{ props: activatorProps }">
      <v-text-field
        :model-value="formattedSafeValue"
        v-bind="{ ...$attrs, ...activatorProps }"
        prepend-icon="mdi-calendar"
        readonly
        :loading="loading"
        :error-messages="errors"
        :disabled="isDisabled"
        variant="outlined"
        @focus="focused = true"
        @blur="focused = false"
      />
    </template>
    <v-date-picker
      :model-value="pickerValue"
      @update:model-value="dateInput"
    />
  </v-menu>
</template>

<script setup>
import { ref, computed } from 'vue';
import { format } from 'date-fns';
import { useSmartInput, smartInputProps, smartInputEmits } from '/imports/client/ui/components/global/useSmartInput';

defineOptions({
  inheritAttrs: false,
});

const props = defineProps({
  ...smartInputProps,
});

const emit = defineEmits([
  ...smartInputEmits,
  'update:model-value',
]);

const {
  safeValue,
  input,
  loading,
  errors,
  isDisabled,
  focused,
} = useSmartInput(props, emit);

const menu = ref(false);

const pickerValue = computed(() => {
  if (!safeValue.value) return undefined;
  const value = safeValue.value instanceof Date
    ? safeValue.value
    : new Date(safeValue.value);
  return Number.isNaN(value.getTime()) ? undefined : value;
});

const formattedSafeValue = computed(() => {
  return pickerValue.value ? format(pickerValue.value, 'YYYY-MM-DD') : '';
});

function dateInput(e) {
  menu.value = false;
  input(e);
}
</script>

<style lang="css" scoped>

</style>
