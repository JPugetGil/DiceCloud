<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        New Library
      </v-toolbar-title>
    </template>
    <text-field
      label="Name"
      :value="library.name"
      :debounce-time="0"
      @change="nameChanged"
    />
    <text-area
      label="Description"
      :value="library.description"
      :debounce-time="0"
      @change="descriptionChanged"
    />
    <template #actions>
      <v-spacer />
      <v-btn
        variant="text"
        :disabled="!valid"
        @click="dialogStackStore.popDialogStack(library)"
      >
        Insert Library
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref} from 'vue';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const library = ref({
  name: 'New Library',
  description: undefined,
});

const valid = ref(true);

const dialogStackStore = useDialogStackStore();

function nameChanged(val, ack) {
  if (val) {
    library.value.name = val;
    valid.value = true;
    ack();
  } else {
    valid.value = false;
    ack('Name is required')
  }
}

function descriptionChanged(val, ack) {
  library.value.description = val;
  ack();
}
</script>

<style lang="css" scoped>

</style>
