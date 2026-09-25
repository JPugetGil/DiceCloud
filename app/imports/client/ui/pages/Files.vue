<template>
  <v-container>
    <v-row dense>
      <v-col cols="12">
        <v-list-subheader> {{ $t('files.archivedCharacters') }} </v-list-subheader>
      </v-col>

      <v-col
        key="upload"
        cols="12"
        sm="6"
        md="4"
        lg="3"
        xl="2"
        class="d-flex flex-1-1 flex-column justify-center"
      >
        <input
          ref="archiveFileInput"
          type="file"
          accept=".json"
          style="display: none;"
          @input="inputArchiveFile"
        >
        <v-btn
          variant="outlined"
          style="height: 100%; width: 100%; min-height: 120px;"
          class="archive-button"
          :color="archiveFileError ? 'error' : undefined"
          :disabled="archiveUploadInProgress"
          @click="archiveFileInput.click()"
        >
          <v-icon start>
            mdi-file-upload-outline
          </v-icon>
          <template v-if="archiveFileError">
            {{ archiveFileError }}
          </template>
          <template v-else>
            {{ $t('files.uploadArchive') }}
          </template>
          <v-progress-linear
            v-if="archiveUploadInProgress"
            :model-value="archiveUploadProgress"
            :indeterminate="archiveUploadIndeterminate"
          />
        </v-btn>
      </v-col>
      <template v-if="archiveFiles && archiveFiles.length">
        <v-col
          v-for="file in archiveFiles"
          :key="file._id"
          cols="12"
          sm="6"
          md="4"
          lg="3"
          xl="2"
        >
          <archive-file-card :model="file" />
        </v-col>
      </template>
    </v-row>
    <v-row dense>
      <v-col cols="12">
        <v-list-subheader> {{ $t('files.images') }} </v-list-subheader>
      </v-col>
      <v-col
        cols="12"
        sm="6"
        md="4"
        lg="3"
        xl="2"
      >
        <image-upload-input
          style="height: 100%; width: 100%; min-height: 120px;"
        />
      </v-col>
      <template v-if="imageFiles && imageFiles.length">
        <v-col
          v-for="file in imageFiles"
          :key="file._id"
          cols="12"
          sm="6"
          md="4"
          lg="3"
          xl="2"
        >
          <user-image-card :model="file" />
        </v-col>
      </template>
    </v-row>
    <!--
    <v-row dense>
      <v-col cols="12">
        <v-list-subheader> {{ $t('files.images') }} </v-list-subheader>
      </v-col>
      <template v-if="userImages && userImages.length">
        <v-col
          v-for="file in userImages"
          :key="file._id"
          cols="12"
          sm="6"
          md="4"
          lg="3"
          xl="2"
        >
          <user-image-card :model="file" />
        </v-col>
      </template>
      <v-col
        key="image-upload"
        cols="12"
        sm="6"
        md="4"
        lg="3"
        xl="2"
        class="d-flex flex-1-1 flex-column justify-center"
      >
        <image-upload-input />
      </v-col>
    </v-row>
    -->
  </v-container>
</template>

<script setup lang="js">
import { ref, watch } from 'vue';
import { Meteor } from 'meteor/meteor';
import { autorun, subscribe } from 'vue-meteor-tracker';
import ArchiveCreatureFiles from '/imports/api/creature/archive/ArchiveCreatureFiles';
import UserImages from '/imports/api/files/userImages/UserImages';
import prettyBytes from 'pretty-bytes';
import ArchiveFileCard from '/imports/client/ui/files/ArchiveFileCard.vue';
import ImageUploadInput from '/imports/client/ui/components/ImageUploadInput.vue';
import UserImageCard from '/imports/client/ui/files/userImages/UserImageCard.vue';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import { archiveSchema } from '/imports/api/creature/archive/ArchiveCreatureFiles';
import migrateArchive from '/imports/migrations/archive/migrateArchive';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

// TODO Mark files that don't have versions.${version}.meta.pipePath set as broken links
// TODO show user images
// TODO delete, rename, etc. user images

const archiveFileInput = ref(null);

const archiveFileError = ref(undefined);
const archiveFile = ref(undefined);
const archiveUploadInProgress = ref(false);
const archiveUploadProgress = ref(0);
const archiveUploadIndeterminate = ref(true);

subscribe('archiveCreatureFiles');
subscribe('userImages');
subscribe('characterList');

const archiveFiles = autorun(() => {
  const userId = Meteor.userId();
  return ArchiveCreatureFiles.find(
    {
      userId,
    }, {
      sort: {'size': -1},
    }
  ).map(f => {
    f.size = prettyBytes(f.size);
    f.link = ArchiveCreatureFiles.link(f);
    return f;
  });
}).result;

const imageFiles = autorun(() => {
  const userId = Meteor.userId();
  return UserImages.find(
    {
      userId,
    }, {
      sort: {
        'meta.createdAt': -1,
        'name': 1,
        'size': -1,
      },
    }
  ).map(f => {
    f.size = prettyBytes(f.size);
    f.link = UserImages.link(f);
    return f;
  });
}).result;

watch(archiveUploadInProgress, (val) => {
  if (val === false) {
    archiveUploadProgress.value = 0;
    archiveUploadIndeterminate.value = true;
  }
});

function inputArchiveFile() {
  archiveFile.value = undefined;
  archiveFileError.value = undefined;
  const file = archiveFileInput.value.files[0];
  // Reset the file input
  archiveFileInput.value.value = null;
  if (!file) return;
  if (file.type !== 'application/json') {
    archiveFileError.value = t('files.mustBeJson');
    return;
  }
  if (file.size > 10000000) {
    archiveFileError.value = t('files.tooLarge');
    return;
  }
  archiveFile.value = file;
  archiveUploadIndeterminate.value = true;
  archiveUploadInProgress.value = true;
  archiveUploadProgress.value = undefined;

  const fr = new FileReader();

  fr.addEventListener('load', () => {
    let data;
    try {
      data = JSON.parse(fr.result);
    } catch (e) {
      archiveFileError.value = t('files.parseFailed');
      archiveUploadInProgress.value = false;
      console.error(e);
      return;
    }
    try {
      // Migrate, clean, and validate the archive
      migrateArchive(data);
      data = archiveSchema.clean(data);
      archiveSchema.validate(data);
    } catch (e) {
      archiveFileError.value = t('files.validationFailed', { reason: e.reason || e.message || e.toString() });
      archiveUploadInProgress.value = false;
      console.error(e);
      return;
    }

    let uploadInstance = ArchiveCreatureFiles.insert({
      file: file,
      meta: {
        creatureName: data?.creature?.name,
        userId: Meteor.userId()
      },
      chunkSize: 'dynamic',
      allowWebWorkers: true // If you see issues with uploads, change this to false
    }, false);

    // These are the event functions, don't need most of them, it shows where we are in the process
    uploadInstance.on('start', function () {
      archiveUploadIndeterminate.value = false;
    });

    uploadInstance.on('end', function () {
      archiveUploadInProgress.value = false;
    });

    uploadInstance.on('uploaded', function () {
      // Remove the file from the input box
      archiveFile.value = undefined;

      // Reset our state for the next file
      archiveUploadInProgress.value = false;
    });

    uploadInstance.on('error', function (error) {
      const text = error.reason || error.message || error;
      snackbar({text});
      archiveFileError.value = text;
      archiveUploadInProgress.value = false;
    });

    uploadInstance.on('progress', function (progress) {
      archiveUploadProgress.value = progress;
    });

    uploadInstance.start();
  });

  fr.readAsText(file);
}
</script>

<style>
  .v-btn.archive-button > .v-btn__content {
    white-space: normal;
    max-width: 100%;
  }
</style>
