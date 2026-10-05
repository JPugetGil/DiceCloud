<template>
  <outlined-input
    :name="label"
    class="smart-image-input mb-3"
    :hint="hint"
    :error-messages="errors"
    :disabled="isDisabled"
    :focused="dragging"
    :data-id="id"
    content-class="smart-image-input__content"
    @click="openImageInputDialog"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <template v-if="model">
      <img
        class="smart-image-input__image"
        :src="model"
        :alt="label"
      >
      <!-- Elevated, so that it reads on any image -->
      <v-btn
        v-if="!isDisabled"
        icon="mdi-close"
        size="small"
        variant="elevated"
        class="smart-image-input__clear"
        :aria-label="$t('common.clear')"
        @click.stop="change(undefined)"
      />
    </template>
    <div
      v-else
      class="smart-image-input__empty d-flex align-center justify-center"
    >
      {{ $t('components.addImage') }}
      <v-icon end>
        mdi-image-outline
      </v-icon>
    </div>
  </outlined-input>
</template>

<script setup>
import { ref, markRaw } from 'vue';
import { Random } from 'meteor/random';

import { useSmartInput, smartInputModel, smartInputProps, smartInputEmits } from '/imports/ui/composables/useSmartInput';
import OutlinedInput from '/imports/ui/properties/viewers/shared/OutlinedInput.vue';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  label: {
    type: String,
    default: '',
  },
  hint: {
    type: String,
    default: undefined,
  },
  ...smartInputProps,
});

const model = defineModel(smartInputModel);

const emit = defineEmits(smartInputEmits);

const { change, errors, isDisabled } = useSmartInput(props, model, emit);

const id = ref(Random.id());
const dragging = ref(false);

// A dropped file opens the dialog with that file already uploading
function openImageInputDialog(file) {
  if (isDisabled.value) return;
  dialogStackStore.pushDialogStack({
    component: 'image-input-dialog',
    elementId: id.value,
    data: {
      href: model.value,
      // Raw: the store's reactive proxy of a File breaks reading it
      droppedFile: file instanceof File ? markRaw(file) : undefined,
    },
    callback: (href) => {
      if (href) {
        change(href);
      }
    },
  });
}


function handleDragOver(event) {
  if (isDisabled.value || !event.dataTransfer?.types.includes('Files')) return;
  // Accept the drop instead of letting the browser open the file
  event.preventDefault();
  dragging.value = true;
}

function handleDragLeave() {
  dragging.value = false;
}

function handleDrop(event) {
  dragging.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (isDisabled.value || !file) return;
  event.preventDefault();
  openImageInputDialog(file);
}
</script>

<style scoped>
/*
 * The content sits inside the outline drawn by OutlinedInput. The padding keeps
 * an image clear of the label notched into the outline's top edge
 */
.smart-image-input :deep(.smart-image-input__content) {
  position: relative;
  min-height: 120px;
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.smart-image-input__image {
  display: block;
  max-width: 100%;
  max-height: 300px;
  border-radius: 4px;
}
.smart-image-input__clear {
  position: absolute;
  top: 8px;
  right: 8px;
}
.smart-image-input__empty {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.smart-image-input:hover .smart-image-input__empty {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}
</style>
