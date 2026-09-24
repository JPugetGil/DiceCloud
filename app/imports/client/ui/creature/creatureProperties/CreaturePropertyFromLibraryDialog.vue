<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        Add from library
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
        Insert
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref } from 'vue';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import LibraryAndNode from '/imports/client/ui/library/LibraryAndNode.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const node = ref(undefined);
</script>

<style lang="css" scoped>

</style>
