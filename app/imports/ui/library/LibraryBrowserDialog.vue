<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('library.communityLibraries') }}
      </v-toolbar-title>
    </template>
    <template #unwrapped-content>
      <library-browser-page />
    </template>
    <template #actions>
      <v-spacer />
      <v-btn
        variant="text"
        @click="dialogStackStore.popDialogStack()"
      >
        {{ $t('common.done') }}
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import DialogBase from '/imports/ui/dialogStack/DialogBase.vue';
import LibraryBrowserPage from '/imports/ui/pages/LibraryBrowserPage.vue';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

const dialogStackStore = useDialogStackStore();
</script>

<style lang="css" scoped>

</style>
