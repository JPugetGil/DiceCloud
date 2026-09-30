<template>
  <v-card
    class="user-image-card d-flex flex-column h-100"
    @click="previewImage"
  >
    <v-img
      cover
      :lazy-src="thumbHashDataUrl"
      :src="model.link"
      :data-id="`${model._id}-image`"
    />
    <div class="flex-1-1" />
    <v-card-title
      v-if="!renaming"
      class="text-no-wrap"
    >
      {{ model.name }}
    </v-card-title>
    <div
      v-else
      class="px-4 pt-2"
    >
      <text-field
        ref="nameInput"
        v-model="newName"
        regular
        hide-details
        density="compact"
        :suffix="model.extension ? `.${model.extension}` : undefined"
        @click.stop=""
        @keydown.stop=""
        @keyup.stop="e => e.key === 'Enter' && (renaming = false)"
      />
    </div>
    <v-card-subtitle class="text-no-wrap">
      {{ model.size }}
    </v-card-subtitle>
    <v-card-actions>
      <v-tooltip
        v-if="missingFromStorage"
        :text="$t('files.notInStorage')"
        location="top"
      >
        <template #activator="{ props: tooltipProps }">
          <v-icon
            v-bind="tooltipProps"
            class="ml-2"
            color="error"
            :aria-label="$t('files.notInStorage')"
            icon="mdi-cloud-alert"
          />
        </template>
      </v-tooltip>
      <div class="flex-1-1" />
      <v-btn
        variant="text"
        icon
        :aria-label="$t('files.renameFile')"
        @click.stop="renaming = !renaming"
      >
        <v-icon>{{ renaming ? 'mdi-check' : 'mdi-pencil' }}</v-icon>
      </v-btn>
      <v-menu location="left">
        <template #activator="{ props: activatorProps }">
          <v-btn
            variant="text"
            icon
            v-bind="activatorProps"
          >
            <v-icon>mdi-delete</v-icon>
          </v-btn>
        </template>
        <v-list>
          <v-list-item @click="removeUserFile">
            <v-list-item-title>
              {{ $t('files.deleteFile') }}
              <v-icon end>
                mdi-delete
              </v-icon>
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
      <v-btn
        variant="text"
        icon
        :href="`${model.link}?download=true`"
        @click.stop
      >
        <v-icon>mdi-download</v-icon>
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import removeUserImage from '/imports/api/files/userImages/methods/removeUserImage';
import renameUserImage from '/imports/api/files/userImages/methods/renameUserImage';
import isMissingFromStorage from '/imports/api/files/isMissingFromStorage';
import { thumbHashToDataURL } from 'thumbhash';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const removeLoading = ref(false);

const missingFromStorage = computed(() => isMissingFromStorage(props.model));

// The name is edited without its extension, which the server keeps
const renaming = ref(false);
const newName = ref('');
const nameInput = ref(null);
const baseName = computed(() => {
  const { name = '', extension } = props.model;
  const suffix = extension ? `.${extension}` : '';
  return suffix && name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
});

watch(renaming, async (value) => {
  if (value) {
    newName.value = baseName.value;
    nextTick(() => nameInput.value?.focus());
  } else if (newName.value?.trim() && newName.value.trim() !== baseName.value) {
    try {
      await renameUserImage.callAsync({ fileId: props.model._id, name: newName.value });
    } catch (error) {
      console.error(error);
      snackbar({ text: error.reason || error.message || error.toString() });
    }
  }
});

const dialogStackStore = useDialogStackStore();

const thumbHashDataUrl = computed(() => {
  const thumbHash = props.model.meta?.thumbHash;
  if (!thumbHash) return;
  return thumbHashToDataURL(thumbHash);
});

async function removeUserFile() {
  removeLoading.value = true;
  try {
    await removeUserImage.callAsync({ fileId: props.model._id });
  } catch (error) {
    snackbar({text: error.reason || error.message || error.toString()})
    console.error(error);
  } finally {
    removeLoading.value = false;
  }
}

function previewImage() {
  dialogStackStore.pushDialogStack({
    component: 'image-preview-dialog',
    elementId: `${props.model._id}-image`,
    data: {
      href: props.model.link,
    },
  });
}
</script>
