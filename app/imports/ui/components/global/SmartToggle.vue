<template>
  <div class="smart-toggle mb-6">
    <div
      :id="labelId"
      class="smart-toggle__label text-caption text-medium-emphasis"
    >
      {{ label }}
    </div>
    <!--
      A Material segmented button: the chosen option is filled with the
      primary container colour and shows a check mark in place of its icon
    -->
    <v-btn-toggle
      v-bind="$attrs"
      class="smart-toggle__group"
      :aria-labelledby="labelId"
      mandatory
      border
      divided
      rounded="pill"
      density="comfortable"
      :model-value="safeValue"
    >
      <v-btn
        v-for="(option, i) in options"
        :key="`toggle-option-${i}`"
        :value="option.value"
        :disabled="isDisabled || (clickedValue != option.value && loading)"
        :variant="option.value == safeValue ? 'flat' : 'text'"
        :color="option.value == safeValue ? 'primary-container' : undefined"
        :prepend-icon="option.value == safeValue ? 'mdi-check' : option.icon"
        :loading="clickedValue == option.value && loading"
        v-on="(model == option.value) ? {} : { click: () => click(option.value) }"
      >
        {{ option.name }}
      </v-btn>
    </v-btn-toggle>
    <v-expand-transition>
      <div
        v-if="errors.length"
        class="pt-2 text-caption text-error"
      >
        {{ errors.join('\n\n') }}
      </div>
    </v-expand-transition>
  </div>
</template>

<script setup>
import { ref, useId } from 'vue';
import { useSmartInput, smartInputModel, smartInputProps, smartInputEmits } from '/imports/ui/composables/useSmartInput';

defineOptions({
  inheritAttrs: false,
});

const props = defineProps({
  ...smartInputProps,
  label: {
    type: String,
    default: '',
  },
  options: {
    type: Array,
    default: () => [],
  },
});

const model = defineModel(smartInputModel);

const emit = defineEmits(smartInputEmits);

const {
  loading,
  safeValue,
  isDisabled,
  errors,
  change,
} = useSmartInput(props, model, emit);

const clickedValue = ref(undefined);
const labelId = useId();

function click(val) {
  clickedValue.value = val;
  change(val);
}
</script>

<style scoped>
.smart-toggle__label {
  margin-bottom: 4px;
  padding-inline-start: 4px;
}

/* The outline and dividers as strong as a text field's (Vuetify's is 0.12) */
.smart-toggle__group {
  --v-border-opacity: 0.38;
}

/*
 * Where space is short the options share the width and wrap their labels
 * between words, instead of the group scrolling sideways at once: Vuetify
 * gives the group a fixed height and its buttons nowrap. An option never gets
 * narrower than its longest word; past that the group still scrolls.
 */
.smart-toggle {
  container-type: inline-size;
}
.v-btn-group.smart-toggle__group {
  height: auto;
  min-height: 40px;
}
.smart-toggle__group .v-btn {
  flex: 0 1 auto;
  min-width: min-content;
  height: auto;
  min-height: 40px;
  padding-block: 4px;
  white-space: normal;
}
.smart-toggle__group :deep(.v-btn__content) {
  white-space: normal;
  text-align: center;
}
/*
 * A phone's width: tighter options without their icons, so that three fit on
 * one line. The chosen option keeps its check mark: it does not rely on its
 * colour alone
 */
@container (max-width: 440px) {
  .smart-toggle__group .v-btn {
    padding-inline: 10px;
    letter-spacing: 0.03em;
  }
  .smart-toggle__group .v-btn:not(.v-btn--active) :deep(.v-btn__prepend) {
    display: none;
  }
}

/*
 * The chosen option is marked by its fill and check mark. Vuetify also lays
 * its "activated" overlay on it, a tint of the text colour that would lower
 * the text's contrast; hover and focus feedback are kept.
 */
.smart-toggle__group :deep(.v-btn--active:not(:hover):not(:focus-visible) > .v-btn__overlay) {
  opacity: 0;
}
</style>
