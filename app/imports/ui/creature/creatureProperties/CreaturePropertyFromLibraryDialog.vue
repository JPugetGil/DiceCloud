<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('library.addFromLibrary') }}
      </v-toolbar-title>
    </template>
    <template #unwrapped-content>
      <library-and-node
        style="height: 100%;"
        selection
        @selected="val => node = val"
      />
    </template>
    <template #actions>
      <v-spacer />
      <v-btn
        variant="text"
        color="primary"
        @click="dialogStackStore.popDialogStack(node)"
      >
        {{ $t('common.insert') }}
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref } from 'vue';
import DialogBase from '/imports/ui/dialogStack/DialogBase.vue';
import LibraryAndNode from '/imports/ui/library/LibraryAndNode.vue';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

const dialogStackStore = useDialogStackStore();

const node = ref(undefined);
</script>

<style lang="css" scoped>

</style>
