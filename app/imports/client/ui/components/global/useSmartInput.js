import { ref, computed, watch, inject, nextTick, onBeforeUnmount, useAttrs } from 'vue';
import { debounce } from 'lodash';

export const smartInputProps = {
  // `default: undefined` stops Vue's Boolean casting: a Boolean-typed prop the
  // parent leaves out becomes `false`. Callers pass `value` (the Vue 2 way), so
  // `modelValue` was always false and won `modelValue ?? value`: selects, toggles,
  // checkboxes and tag fields showed "false" instead of the stored value.
  value: {
    type: [String, Number, Date, Array, Object, Boolean],
    default: undefined,
  },
  modelValue: {
    type: [String, Number, Date, Array, Object, Boolean],
    default: undefined,
  },
  errorMessages: [String, Array],
  disabled: Boolean,
  debounce: {
    type: Number,
    default: undefined,
  },
  rules: Array,
};

export const smartInputEmits = ['input', 'update:modelValue', 'change'];

export function useSmartInput(props, emit, options = {}) {
  const context = inject('context', {});
  const attrs = useAttrs();

  const error = ref(false);
  const ackErrors = ref(null);
  const rulesErrors = ref(null);
  const focused = ref(false);
  const loading = ref(false);
  const dirty = ref(false);
  const safeValue = ref(props.modelValue ?? props.value);
  const inputValue = ref(props.modelValue ?? props.value);

  const debounceTime = computed(() => {
    if (Number.isFinite(props.debounce)) {
      return props.debounce;
    } else if (Number.isFinite(context?.debounceTime)) {
      return context.debounceTime;
    } else {
      return options.defaultDebounceTime !== undefined 
        ? (typeof options.defaultDebounceTime === 'function' ? options.defaultDebounceTime() : options.defaultDebounceTime) 
        : 750;
    }
  });

  const isDisabled = computed(() => {
    return context?.editPermission === false || props.disabled;
  });

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

  const hasChangeListener = () => {
    return !!attrs.onChange || !!attrs['onUpdate:modelValue'] || !!attrs.onInput;
  };

  const forceSafeValueUpdate = () => {
    safeValue.value = null;
    nextTick(() => {
      safeValue.value = props.modelValue ?? props.value;
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
      ackErrors.value = 'Something went wrong';
      console.error(err);
    }
  };

  const change = (val) => {
    dirty.value = true;
    if (hasChangeListener()) loading.value = true;
    emit('change', val, acknowledgeChange);
  };

  let debouncedChange = debounce(change, debounceTime.value);

  watch(debounceTime, (newVal) => {
    debouncedChange = debounce(change, newVal);
  });

  const input = (val) => {
    emit('input', val);
    emit('update:modelValue', val);
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

  watch(focused, (newFocus) => {
    if (!newFocus && !dirty.value && !error.value) {
      forceSafeValueUpdate();
    }
    if (!newFocus && dirty.value && !(rulesErrors.value && rulesErrors.value.length)) {
      if (hasChangeListener()) loading.value = true;
    }
  });

  watch(dirty, (newDirty) => {
    if (!newDirty && !focused.value && !error.value) {
      forceSafeValueUpdate();
    }
  });

  watch(() => props.modelValue ?? props.value, (newValue) => {
    if (!focused.value && !(rulesErrors.value && rulesErrors.value.length)) {
      safeValue.value = newValue;
    }
  });

  watch(safeValue, () => {
    error.value = false;
    ackErrors.value = null;
  });

  onBeforeUnmount(() => {
    if (debouncedChange && debouncedChange.flush) {
      debouncedChange.flush();
    }
  });

  return {
    error,
    ackErrors,
    rulesErrors,
    focused,
    loading,
    dirty,
    safeValue,
    inputValue,
    debounceTime,
    isDisabled,
    errors,
    input,
    change,
    acknowledgeChange,
    forceSafeValueUpdate
  };
}
