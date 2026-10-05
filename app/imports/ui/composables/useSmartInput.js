import { t } from '/imports/ui/i18n';
import { ref, computed, watch, inject, nextTick, onBeforeUnmount } from 'vue';
import { debounce } from 'lodash';

// Options for each smart input's `defineModel`. The value only flows down: the
// parent saves it when the input emits `change`, so a parent binds
// `:model-value` to the stored value rather than `v-model`.
// `default: undefined` stops Vue's Boolean casting: a Boolean-typed prop the
// parent leaves out would otherwise become `false`
export const smartInputModel = {
  type: [String, Number, Date, Array, Object, Boolean],
  default: undefined,
};

export const smartInputProps = {
  errorMessages: [String, Array],
  disabled: Boolean,
  debounce: {
    type: Number,
    default: undefined,
  },
  rules: Array,
  // The parent's @change listener, declared as a prop so that the input can
  // tell whether anyone will acknowledge its changes: Vue keeps the listeners
  // of declared events out of $attrs. `emit('change')` still calls it.
  onChange: {
    type: Function,
    default: undefined,
  },
};

export const smartInputEmits = ['change'];

export function useSmartInput(props, model, emit, options = {}) {
  const context = inject('context', {});

  const error = ref(false);
  const ackErrors = ref(null);
  const rulesErrors = ref(null);
  const focused = ref(false);
  const loading = ref(false);
  const dirty = ref(false);
  const safeValue = ref(model.value);

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

  const hasChangeListener = () => !!props.onChange;

  const forceSafeValueUpdate = () => {
    safeValue.value = null;
    nextTick(() => {
      safeValue.value = model.value;
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

  let debouncedChange = debounce(change, debounceTime.value);

  watch(debounceTime, (newVal) => {
    debouncedChange = debounce(change, newVal);
  });

  const input = (val) => {
    model.value = val;
    // The Vuetify input is controlled by safeValue, and Vue 3 re-applies its
    // value on every render: safeValue must follow the user's input, or the next
    // render undoes it
    safeValue.value = val;
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

  watch(model, (newValue) => {
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
    focused,
    loading,
    safeValue,
    isDisabled,
    errors,
    input,
    change,
  };
}
