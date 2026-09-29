<template>
  <v-col
    class="mb-3"
    v-bind="cols"
  >
    <outlined-input
      :name="name"
      class="h-100"
      hide-details
      no-hover
      content-class="pa-3 d-flex flex-column align-center justify-center h-100 overflow-hidden"
      @click="$emit('click', $event)"
    >
      <img
        :src="href"
        class="image"
        :data-id="`image-${href}`"
        @click="previewImage"
      >
    </outlined-input>
  </v-col>
</template>

<script setup>
import OutlinedInput from '/imports/ui/properties/viewers/shared/OutlinedInput.vue';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

const props = defineProps({
  name: {
    type: String,
    default: undefined,
  },
  href: {
    type: String,
    default: undefined,
  },
  aspectRatio: {
    type: Number,
    default: 1,
  },
  cols: {
    type: Object,
    default: () => ({cols: 12, sm: 6, md: 4}),
  },
});

defineEmits(['click']);

const dialogStackStore = useDialogStackStore();

function previewImage() {
  dialogStackStore.pushDialogStack({
    component: 'image-preview-dialog',
    elementId: `image-${props.href}`,
    data: {
      href: props.href,
      aspectRatio: props.aspectRatio,
    },
  });
}
</script>

<style lang="css" scoped>
.image {
  cursor: zoom-in;
  cursor: -webkit-zoom-in;
  cursor: -moz-zoom-in;
  max-height: 400px;
  max-width: 100%;
}
</style>

