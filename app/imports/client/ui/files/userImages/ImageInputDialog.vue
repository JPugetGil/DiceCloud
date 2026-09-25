<template>
  <dialog-base>
    <template #toolbar>
      <v-tabs
        v-model="tab"
        :color="$vuetify.theme.themes.dark.colors.accent"
        grow
      >
        <v-tab>{{ $t('files.userFiles') }}</v-tab>
        <v-tab>{{ $t('files.fromUrl') }}</v-tab>
      </v-tabs>
    </template>
    <template #unwrapped-content>
      <v-window
        v-model="tab"
        class="file-input-content fill-height"
      >
        <v-window-item
          class="fill-height"
          style="overflow: auto;"
        >
          <div
            class="user-image-list pa-4 d-flex flex-wrap"
          >
            <image-upload-input
              class="ma-1"
              style="height: 250px;"
              @uploaded="link => selectUserImage(link)"
            />
            <v-img
              v-for="file in userImages"
              :key="file._id"
              cover
              :data-id="file._id"
              class="user-image ma-1 v-sheet"
              :class="{'elevation-4': file.link === href}"
              height="250"
              :src="file.link"
              :lazy-src="file.thumbHashDataUrl"
              @click="selectUserImage(file.link)"
            >
              <v-btn
                variant="text"
                class="zoom-button"
                icon
                @click.stop="previewImage(file)"
              >
                <v-icon>mdi-magnify-plus</v-icon>
              </v-btn>
            </v-img>
            <div
              style="height: 0;"
              class="ma-1"
            />
            <div
              style="height: 0;"
              class="ma-1"
            />
            <div
              style="height: 0;"
              class="ma-1"
            />
          </div>
        </v-window-item>
        <v-window-item
          class="fill-height"
        >
          <v-card-text class="fill-height d-flex flex-column justify-center align-center">
            <v-text-field
              v-model="inputHref"
              :label="$t('files.directLink')"
              class="flex-grow-0"
              style="width: 100%"
            />
          </v-card-text>
        </v-window-item>
      </v-window>
    </template>
    <template #actions>
      <v-spacer />
      <v-btn
        v-if="tab === 1"
        color="accent"
        variant="outlined"
        :disabled="!inputHref"
        @click="selectUserImage(inputHref)"
      >
        <v-icon start>
          mdi-check
        </v-icon>
        {{ $t('common.save') }}
      </v-btn>
      <v-btn
        v-else
        variant="text"
        @click="emit('pop')"
      >
        {{ $t('common.close') }}
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref } from 'vue';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';

import UserImages from '/imports/api/files/userImages/UserImages';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import ImageUploadInput from '/imports/client/ui/components/ImageUploadInput.vue';
import prettyBytes from 'pretty-bytes';
import { thumbHashToDataURL } from 'thumbhash';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  href: {
    type: String,
    default: undefined,
  },
});

const emit = defineEmits(['pop']);


const tab = ref(0);
const inputHref = ref(props.href);

subscribe('userImages');

const userImages = autorun(() => {
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
    if (f.meta?.thumbHash) {
      f.thumbHashDataUrl = thumbHashToDataURL(f.meta.thumbHash);
    }
    return f;
  });
}).result;

function previewImage(file) {
  dialogStackStore.pushDialogStack({
    component: 'image-preview-dialog',
    elementId: file._id,
    data: {
      href: file.link,
    },
  });
}

function selectUserImage(href) {
  dialogStackStore.popDialogStack(href);
}
</script>

<style lang="css" scoped>
.user-image-list > * {
  height: 250px;
  width: 250px;
  flex-basis: 200px;
  flex-grow: 1;
  flex-shrink: 1;
}
.user-image-list > .upload-image-button {
  height: 250px;
}
.user-image {
  cursor: pointer;
}
.user-image.elevation-4 {
  border: 2px solid rgb(var(--v-theme-primary));
}
.zoom-button {
  position: absolute;
  cursor: zoom-in;
  bottom: 0;
  right: 0;
}
</style>
