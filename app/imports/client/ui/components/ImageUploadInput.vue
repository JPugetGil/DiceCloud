<template>
  <div
    v-bind="$attrs"
    class="d-flex flex-column "
  >
    <v-btn
      variant="outlined"
      block
      class="image-upload-button flex-grow-1"
      v-bind="$attrs"
      style="min-height: 64px;"
      :loading="uploadingInProgress"
      @click="hiddenFileInput?.click()"
    >
      <v-icon start>
        mdi-file-upload-outline
      </v-icon>
      <div>
        Upload Image
      </div>
      <template #loader>
        <v-progress-circular
          :model-value="progress"
          :indeterminate="uploadIndeterminate"
        />
      </template>
      <input
        ref="hiddenFileInput"
        type="file"
        accept="image/*"
        style="display: none;"
        @input="inputChange"
      >
    </v-btn>
    <v-alert
      v-if="fileUploadError"
      variant="outlined"
      type="error"
      class="mb-0 mt-4"
    >
      {{ fileUploadError }}
    </v-alert>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import UserImages from '/imports/api/files/userImages/UserImages';
import getThumbHash from '/imports/client/ui/utility/getThumbHash.js';

const emit = defineEmits(['uploaded']);

const progress = ref(0);
const file = ref(undefined);
const uploadingInProgress = ref(false);
const fileUploadError = ref(undefined);
const uploadIndeterminate = ref(false);

const hiddenFileInput = ref(null);

watch(file, async (newFile) => {
  if (!newFile) return;
  let thumbHash = undefined;

  // Start the loading state here, because we are loading and processing the image into
  // a thumb hash
  uploadingInProgress.value = true;
  uploadIndeterminate.value = true;

  // ThumbHashes are nice to have, but don't break upload if they fail
  try {
    thumbHash = await getThumbHash(newFile);
  } catch (e) {
    console.error('Failed to generate thumbHash');
    console.error(e);
  }

  // Start the image insert process
  const uploadInstance = UserImages.insert({
    file: newFile,
    chunkSize: 'dynamic',
    allowWebWorkers: true,
    meta: {
      createdAt: new Date(),
      thumbHash,
    },
  }, false);

  uploadInstance.on('start', function () {
    progress.value = 0;
    uploadIndeterminate.value = false;
    // Remove errors
    fileUploadError.value = undefined;
  });

  uploadInstance.on('end', function (error, fileObj) {
    resetState();
    emit('uploaded', UserImages.link(fileObj));
  });

  uploadInstance.on('uploaded', function () {
    progress.value = 0;
  });

  uploadInstance.on('error', function (error) {
    fileUploadError.value = error.reason || error.message || error.toString();
  });

  uploadInstance.on('progress', function (prog) {
    // Update our progress bar with actual progress
    uploadIndeterminate.value = false;
    progress.value = prog;
  });

  try {
    uploadInstance.start(); // Must manually start the upload
  } catch (error) {
    fileUploadError.value = error.reason || error.message || error.toString();
    resetState();
  }
});

function inputChange(e) {
  if (!e.target) return;
  const { files: selectedFiles } = e.target;
  if (!selectedFiles) return;
  file.value = selectedFiles[0];
  return;
}

function resetState() {
  // Remove file from input
  file.value = undefined;
  if (hiddenFileInput.value) {
    hiddenFileInput.value.value = '';
  }
  // stop progress
  uploadingInProgress.value = false;
  progress.value = 0;
}
</script>

<style>

</style>
