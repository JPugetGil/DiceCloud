<template>
  <outlined-input
    :name="label"
    class="mb-6 pt-1"
  >
    <v-btn-toggle
      v-bind="$attrs"
      class="smart-toggle-group"
      mandatory
      tile
      group
      :model-value="safeValue"
      color="primary"
      style="flex-wrap: wrap;"
    >
      <v-btn
        v-for="(option, i) in options"
        :key="`toggle-option-${i}`"
        :value="option.value"
        :disabled="isDisabled || (clickedValue != option.value && loading)"
        :variant="clickedValue != option.value && loading ? 'plain' : undefined"
        :loading="clickedValue == option.value && loading"
        height="42"
        v-on="(model == option.value) ? {} : { click: () => click(option.value) }"
      >
        <v-icon
          v-if="option.icon"
          start
        >
          {{ option.icon }}
        </v-icon>
        {{ option.name }}
      </v-btn>
    </v-btn-toggle>
    <v-expand-transition>
      <div
        v-if="errors.length"
        class="pa-2 text-error"
      >
        {{ errors.join('\n\n') }}
      </div>
    </v-expand-transition>
  </outlined-input>
</template>

<script setup>
import { ref } from 'vue';
import { useSmartInput, smartInputModel, smartInputProps, smartInputEmits } from '/imports/ui/composables/useSmartInput';
import OutlinedInput from '/imports/ui/properties/viewers/shared/OutlinedInput.vue';

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

function click(val) {
  clickedValue.value = val;
  change(val);
}
</script>

<style scoped>
/*
 * Options wrap onto more rows when they do not fit (narrow screens, long
 * labels). Vuetify's button group has a fixed height and hides overflow, which
 * would cut every row after the first.
 */
.v-btn-group.smart-toggle-group {
  height: auto;
}

/*
 * The selected option is marked by its fill. Vuetify also lays its "activated"
 * overlay on it, which lightened the light theme's red under white text to
 * 4.4:1; without it the text is 6.6:1 (light) and 9.8:1 (dark). Hover and focus
 * feedback are kept.
 */
.smart-toggle-group :deep(.v-btn--active:not(:hover):not(:focus-visible) > .v-btn__overlay) {
  opacity: 0;
}
</style>
