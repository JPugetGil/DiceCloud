<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('library.selectLibraryProperty') }}
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
      <v-btn
        variant="text"
        color="primary"
        @click="dialogStackStore.popDialogStack()"
      >
        {{ $t('common.cancel') }}
      </v-btn>
      <v-spacer />
      <v-btn
        variant="text"
        color="primary"
        @click="dialogStackStore.popDialogStack(node)"
      >
        {{ $t('common.select') }}
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref} from 'vue';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import LibraryAndNode from '/imports/client/ui/library/LibraryAndNode.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const node = ref(undefined);

const dialogStackStore = useDialogStackStore();
</script>

<style lang="css" scoped>
</style>
