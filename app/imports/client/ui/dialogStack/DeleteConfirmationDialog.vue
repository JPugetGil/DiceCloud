<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        Delete {{ typeName }}
      </v-toolbar-title>
    </template>
    <div>
      <v-alert
        type="warning"
        variant="outlined"
      >
        This can't be undone
      </v-alert>
      <p v-if="name">
        Type "{{ name }}" to permanenetly delete.
      </p>
      <v-text-field
        v-if="name"
        v-model="inputName"
        label="Confirmation"
        variant="outlined"
      />
      <div class="d-flex flex-1-1 justify-center">
        <v-btn
          v-show="nameMatch"
          class="bg-primary"
          @click="dialogStackStore.popDialogStack(true);"
        >
          Delete forever
        </v-btn>
      </div>
    </div>
    <template #actions>
      <v-spacer />
      <v-btn
        variant="text"
        @click="dialogStackStore.popDialogStack()"
      >
        Cancel
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref, computed } from 'vue';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const props = defineProps({
  typeName: {
    type: String,
    default: undefined,
  },
  name: {
    type: String,
    default: undefined,
  },
});

const inputName = ref(undefined);

const dialogStackStore = useDialogStackStore();

const nameMatch = computed(() => {
  if (!props.name) return true;
  let uppername = props.name.toUpperCase();
  let upperInputName = inputName.value && inputName.value.toUpperCase();
  return uppername === upperInputName;
});
</script>

<style lang="css" scoped>

</style>
