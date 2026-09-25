<template>
  <v-text-field
    ref="inputRef"
    v-bind="$attrs"
    class="dc-text-field"
    :loading="loading"
    :error-messages="errors"
    :model-value="safeValue"
    :disabled="isDisabled"
    :variant="!regular ? 'outlined' : undefined"
    @update:model-value="onInput"
    @focus="focused = true"
    @blur="focused = false"
    @keyup="e => emit('keyup', e)"
  >
    <template #append>
      <slot name="value" />
    </template>
    <template #prepend>
      <slot name="prepend" />
    </template>
  </v-text-field>
</template>

<script setup lang="js">
import { ref, computed, watch, inject, onBeforeUnmount, nextTick, useAttrs } from 'vue';
import { debounce as debounceFn } from 'lodash';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

defineOptions({
  inheritAttrs: false,
});

const props = defineProps({
  regular: Boolean,
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

const emit = defineEmits(['keyup', 'input', 'change']);
const attrs = useAttrs();

const context = inject('context', {});

const error = ref(false);
const ackErrors = ref(null);
const rulesErrors = ref(null);
const focused = ref(false);
const loading = ref(false);
const dirty = ref(false);
const safeValue = ref(props.value);
const inputValue = ref(props.value);

const inputRef = ref(null);

const errors = computed(() => {
  let errs = ackErrors.value ? [ackErrors.value] : [];
  if (Array.isArray(rulesErrors.value)) {
    errs.push(...rulesErrors.value);
  }
  if (Array.isArray(props.errorMessages)) {
    errs.push(...props.errorMessages);
  } else if (typeof props.errorMessages === 'string' && props.errorMessages) {
    errs.push(props.errorMessages);
  }
  return errs;
});

const isDisabled = computed(() => {
  return context.editPermission === false || props.disabled;
});

const debounceTime = computed(() => {
  if (Number.isFinite(props.debounce)) {
    return props.debounce;
  } else if (Number.isFinite(context.debounceTime)) {
    return context.debounceTime;
  } else {
    return 750;
  }
});

const hasChangeListener = () => {
  // attrs keys might be normalized differently in Vue 3, check common variations
  return !!attrs.onChange || !!attrs.onchange || !!attrs['on-change'];
};

const forceSafeValueUpdate = () => {
  safeValue.value = null;
  nextTick(() => {
    safeValue.value = props.value;
  });
};

const acknowledgeChange = (err) => {
  loading.value = false;
  dirty.value = false;
  error.value = !!err;
  if (!err) {
    ackErrors.value = null;
  } else if (typeof err === 'string') {
    ackErrors.value = err;
  } else if (err.reason) {
    ackErrors.value = err.reason;
  } else if (err.message) {
    ackErrors.value = err.message;
  } else {
    ackErrors.value = t('common.somethingWentWrong');
    console.error(err);
  }
};

const change = (val) => {
  dirty.value = true;
  if (hasChangeListener()) loading.value = true;
  emit('change', val, acknowledgeChange);
};

const debouncedChange = debounceFn(change, debounceTime.value);

const onInput = (val) => {
  emit('input', val);
  // v-text-field is controlled by safeValue, and Vue 3 re-applies an input's
  // value on every render: unless safeValue follows the typing, the next render
  // (a validation message appearing, say) wipes out what was typed
  safeValue.value = val;
  inputValue.value = val;
  dirty.value = true;

  rulesErrors.value = null;
  if (props.rules && props.rules.length) {
    props.rules.forEach(rule => {
      const result = rule(val);
      if (typeof result === 'string') {
        if (!rulesErrors.value) rulesErrors.value = [];
        rulesErrors.value.push(result);
      }
    });
  }
  if (rulesErrors.value) {
    return;
  }

  debouncedChange(val);
};

const focus = () => {
  inputRef.value?.focus();
};

defineExpose({
  focus,
});

watch(focused, (newFocus) => {
  if (!newFocus && !dirty.value && !error.value) {
    forceSafeValueUpdate();
  }
  if (
    !newFocus &&
    dirty.value &&
    !(rulesErrors.value && rulesErrors.value.length)
  ) {
    if (hasChangeListener()) loading.value = true;
  }
});

watch(dirty, (newDirty) => {
  if (!newDirty && !focused.value && !error.value) {
    forceSafeValueUpdate();
  }
});

watch(() => props.value, (newValue) => {
  if (
    !focused.value &&
    !(rulesErrors.value && rulesErrors.value.length)
  ) {
    safeValue.value = newValue;
  }
});

watch(safeValue, () => {
  error.value = false;
  ackErrors.value = null;
});

onBeforeUnmount(() => {
  debouncedChange.flush();
});
</script>

<style lang="css">
.dc-text-field .v-input__append-inner{
  font-size: 12px;
  margin-top: 36px;
}
</style>
