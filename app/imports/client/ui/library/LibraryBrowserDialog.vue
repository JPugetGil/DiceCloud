<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('library.communityLibraries') }}
      </v-toolbar-title>
    </template>
    <template #unwrapped-content>
      <library-browser />
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
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import LibraryBrowser from '/imports/client/ui/pages/LibraryBrowser.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();
</script>

<style lang="css" scoped>

</style>
