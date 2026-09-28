<template>
  <div class="d-flex align-start">
    <outlined-input
      :name="$t('forms.iconColor.icon')"
      class="picker-field"
    >
      <icon-picker
        :model-value="model.icon"
        :width="72"
        :height="56"
        @change="(value, ack) =>$emit('change', {path: ['icon'], value, ack})"
      />
    </outlined-input>
    <outlined-input
      :name="$t('forms.iconColor.color')"
      class="picker-field ms-2"
    >
      <color-picker
        :model-value="model.color"
        :width="72"
        :height="56"
        @update:model-value="value =>$emit('change', {path: ['color'], value})"
      />
    </outlined-input>
  </div>
</template>

<script setup>
import ColorPicker from '/imports/ui/components/ColorPicker.vue';
import OutlinedInput from '/imports/ui/properties/viewers/shared/OutlinedInput.vue';

defineProps({
  model: {
    type: Object,
    required: true,
  },
});

defineEmits(['change']);
</script>

<style lang="css" scoped>
/* As tall as the name field beside them, and wide enough for their labels */
.picker-field {
  flex: 0 0 auto;
}
</style>
