<template>
  <div class="labeled-fab">
    <!-- elevated: speed dials sit in toolbars, which default buttons to `text` -->
    <v-btn
      class="rounded-circle"
      size="small"
      variant="elevated"
      v-bind="$attrs"
      :aria-label="label"
      :disabled="disabled"
      :style="disabled ? 'background-color: #616161 !important;' : ''"
      @click="$emit('click')"
    >
      <v-icon>{{ icon }}</v-icon>
    </v-btn>
    <!--
      Beside the button, not in it: Vuetify buttons hide their overflow, which
      clipped a label placed inside away entirely
    -->
    <span
      v-if="label"
      class="labeled-fab__label bg-surface-variant text-label-medium rounded elevation-2 px-2 py-1"
      :class="{ 'cursor-pointer': !disabled }"
      @click="!disabled && $emit('click')"
    >
      {{ label }}
    </span>
  </div>
</template>

<script setup>
/*
 * A small speed dial button with its label to its left, as Material's speed
 * dials show them.
 */
defineOptions({ inheritAttrs: false });

defineProps({
  icon: {
    type: String,
    default: undefined,
  },
  label: {
    type: String,
    default: undefined,
  },
  disabled: Boolean,
});

defineEmits(['click']);
</script>

<style scoped>
.labeled-fab {
  position: relative;
  display: inline-flex;
}

.labeled-fab__label {
  position: absolute;
  right: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  white-space: nowrap;
}
</style>
