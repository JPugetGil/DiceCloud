<template>
  <v-card
    class="user-image-card d-flex flex-column"
    @click="previewImage"
  >
    <v-img
      cover
      :lazy-src="thumbHashDataUrl"
      :src="model.link"
      :data-id="`${model._id}-image`"
    />
    <div class="flex-1-1" />
    <v-card-title class="text-no-wrap">
      {{ model.name }}
    </v-card-title>
    <v-card-subtitle class="text-no-wrap">
      {{ model.size }}
    </v-card-subtitle>
    <v-card-actions>
      <div class="flex-1-1" />
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
              Delete file
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
import { ref, computed } from 'vue';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import removeUserImage from '/imports/api/files/userImages/methods/removeUserImage';
import { thumbHashToDataURL } from 'thumbhash';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const removeLoading = ref(false);

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

<style scoped>
  .no-wrap {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .user-image-card {
    height: 100%;
  }
</style>
