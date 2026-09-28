<template>
  <v-input
    class="outlined-input"
    :class="[$attrs.class, { 'outlined-input--no-hover': noHover }]"
    :style="$attrs.style"
    :hint="hint"
    :persistent-hint="!!hint"
    :error-messages="errorMessages"
    :hide-details="hideDetails"
    :disabled="disabled"
  >
    <v-field
      variant="outlined"
      :label="name"
      :active="!!name"
      :focused="focused"
      :error="hasErrors"
      :disabled="disabled"
    >
      <!--
        The field cancels clicks it did not start from focusing its input;
        stopping them here keeps links and checkboxes inside working
      -->
      <div
        v-bind="{ ...$attrs, class: undefined, style: undefined }"
        class="outlined-input__content"
        :class="contentClass"
        @click.stop
      >
        <slot />
      </div>
    </v-field>
  </v-input>
</template>

<script setup>
import { computed } from 'vue';

/*
 * A labelled outline around content that is not a text input (icon and colour
 * pickers, images, a property tree), drawn by Vuetify's own field so that its
 * border, notched label, hover and messages match the text fields beside it.
 * class and style lay out the whole input; other attributes and listeners go
 * to the content inside the outline.
 */
defineOptions({
  inheritAttrs: false,
});

const props = defineProps({
  name: {
    type: String,
    default: undefined,
  },
  hint: {
    type: String,
    default: undefined,
  },
  errorMessages: {
    type: [String, Array],
    default: undefined,
  },
  hideDetails: {
    type: [Boolean, String],
    default: false,
  },
  // Highlights the outline, as a focused field's
  focused: Boolean,
  disabled: Boolean,
  // Keeps the outline from darkening on hover, for content that is not an input
  noHover: Boolean,
  contentClass: {
    type: [String, Array, Object],
    default: undefined,
  },
});

const hasErrors = computed(() => {
  const errors = props.errorMessages;
  return Array.isArray(errors) ? errors.length > 0 : !!errors;
});
</script>

<style scoped>
.outlined-input__content {
  width: 100%;
  min-width: 0;
  /* The field shows a text cursor for typing, which none of this content takes */
  cursor: auto;
}
/* Vuetify's resting outline opacity, kept on hover */
.outlined-input--no-hover :deep(.v-field:hover .v-field__outline) {
  --v-field-border-opacity: 0.38;
}
</style>
