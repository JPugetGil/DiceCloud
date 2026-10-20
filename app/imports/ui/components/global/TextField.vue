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
    <template
      v-if="$slots.value"
      #append-inner
    >
      <span class="dc-text-field__value text-body-medium text-medium-emphasis">
        <slot name="value" />
      </span>
    </template>
    <template
      v-if="$slots.prepend"
      #prepend
    >
      <slot name="prepend" />
    </template>
  </v-text-field>
</template>

<script setup lang="js">
import { ref } from 'vue';
import { smartInputModel, useSmartInput } from '/imports/ui/composables/useSmartInput';

defineOptions({
  inheritAttrs: false,
});

const props = defineProps({
  regular: Boolean,
  errorMessages: {
    type: /** @type {import('vue').PropType<string | string[]>} */ ([String, Array]),
    default: undefined,
  },
  disabled: Boolean,
  debounce: {
    type: Number,
    default: undefined,
  },
  // Checked before a change is sent (useSmartInput), as the other smart
  // inputs do: left to Vuetify, a broken rule showed but the change went
  rules: {
    type: Array,
    default: undefined,
  },
  // The parent's @change listener, declared as a prop so that the field can
  // tell whether anyone will acknowledge its changes: Vue keeps the listeners
  // of declared events out of $attrs. `emit('change')` still calls it.
  onChange: {
    type: Function,
    default: undefined,
  },
});

const model = defineModel(smartInputModel);

const emit = defineEmits(['keyup', 'change']);

// What every smart input does (useSmartInput): the debounced change, its
// acknowledgement and errors, and the value shown while the user types. This
// field had its own copy of it
const { focused, loading, safeValue, isDisabled, errors, input: onInput } = useSmartInput(props, model, emit);

const inputRef = ref(/** @type {InstanceType<typeof import('vuetify/components').VTextField> | null} */ (null));

const focus = () => {
  inputRef.value?.focus();
};

defineExpose({
  focus,
});
</script>

<style lang="css">
/* A computed field's result, shown inside the field after what was typed */
.dc-text-field__value {
  white-space: nowrap;
  margin-inline-start: 8px;
}
</style>
