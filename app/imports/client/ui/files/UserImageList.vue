<template>
  <v-row
    dense
    @drop.prevent="addDropFile"
    @dragover.prevent="imageDragOver"
  >
    <v-col cols="12">
      <v-list-subheader> {{ $t('files.images') }} </v-list-subheader>
    </v-col>
    <template v-if="userImages && userImages.length">
      <v-col
        v-for="userImage in userImages"
        :key="userImage._id"
        cols="12"
        sm="6"
        md="4"
        lg="3"
        xl="2"
      >
        <user-image-card :model="userImage" />
      </v-col>
    </template>
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
        ref="uploadImageInput"
        type="file"
        accept=".json"
        style="display: none;"
        @input="uploadImageFile"
      >
      <v-btn
        variant="outlined"
        style="height: 100%; width: 100%; min-height: 120px;"
        class="archive-button"
        :color="uploadImageError ? 'error' : undefined"
        :disabled="uploadImageInProgress"
        @click="uploadImageInput.click()"
      >
        <v-icon start>
          mdi-file-upload-outline
        </v-icon>
        <template v-if="uploadImageError">
          {{ uploadImageError }}
        </template>
        <template v-else>
          {{ $t('files.uploadArchive') }}
        </template>
        <v-progress-linear
          v-if="uploadImageInProgress"
          :model-value="imageUploadProgress"
          :indeterminate="imageUploadIndeterminate"
        />
      </v-btn>
    </v-col>
  </v-row>
</template>

<script setup lang="js">
import { ref } from 'vue';
import { autorun, subscribe } from 'vue-meteor-tracker';
import prettyBytes from 'pretty-bytes';
import UserImages from '/imports/api/files/userImages/UserImages';
import UserImageCard from '/imports/client/ui/files/UserImageCard.vue';

const uploadImageInput = ref(null);

subscribe('userImages');

const userImages = autorun(() => {
  const userId = Meteor.userId();
  return UserImages.find({
    userId
  }, {
    sort: {
      size: -1
    },
  }).map(f => {
    f.size = prettyBytes(f.size);
    f.link = UserImages.link(f);
    return f;
  });
}).result;
</script>
