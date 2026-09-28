<template>
  <div
    class="d-flex flex-wrap align-start"
  >
    <outlined-input
      :name="$t('forms.iconColor.icon')"
      class="mb-4"
    >
      <icon-picker
        :model-value="model.icon"
        :width="54"
        :height="54"
        @change="(value, ack) =>$emit('change', {path: ['icon'], value, ack})"
      />
    </outlined-input>
    <outlined-input
      :name="$t('forms.iconColor.color')"
      class="mb-4 ml-2"
    >
      <color-picker
        :model-value="model.color"
        :width="54"
        :height="54"
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
</style>
