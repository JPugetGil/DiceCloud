<template>
  <v-btn
    variant="text"
    icon
    :data-id="randomId"
    v-bind="$attrs"
    @click="openArchive"
  >
    <v-icon>
      mdi-archive
    </v-icon>
  </v-btn>
</template>

<script setup>
import { Random } from 'meteor/random';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

const dialogStackStore = useDialogStackStore();

const randomId = Random.id();

function openArchive() {
  dialogStackStore.pushDialogStack({
    component: 'archive-dialog',
    elementId: randomId,
  });
}
</script>

<style lang="css" scoped>
</style>
