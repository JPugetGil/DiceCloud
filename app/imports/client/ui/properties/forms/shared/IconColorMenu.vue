<template>
  <div
    class="d-flex flex-wrap align-start"
  >
    <outlined-input
      :name="$t('forms.iconColor.icon')"
      class="mb-4"
    >
      <icon-picker
        :value="model.icon"
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
        :value="model.color"
        :width="54"
        :height="54"
        @input="value =>$emit('change', {path: ['color'], value})"
      />
    </outlined-input>
  </div>
</template>

<script setup>
import ColorPicker from '/imports/client/ui/components/ColorPicker.vue';
import OutlinedInput from '/imports/client/ui/properties/viewers/shared/OutlinedInput.vue';

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
