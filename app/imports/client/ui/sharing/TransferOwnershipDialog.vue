<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        Transfer Ownership
      </v-toolbar-title>
    </template>
    <v-alert
      type="error"
      variant="outlined"
    >
      <template v-if="error">
        <p>
          {{ error }}
        </p>
      </template>
      <template v-else>
        <p>
          Are you sure you want to transfer ownership to {{ user.username || user._id }}?
        </p><p>
          This can only be undone by the user you are transferring ownership to.
        </p><p>
          You will still have edit permission.
        </p>
      </template>
    </v-alert>
    <div class="d-flex flex-1-1 justify-center">
      <v-btn
        color="accent"
        @click="transfer"
      >
        Transfer
        <template v-if="user.username">
          to {{ user.username }}
        </template>
      </v-btn>
    </div>
  </dialog-base>
</template>

<script setup>
import { ref} from 'vue';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import { transferOwnership } from '/imports/api/sharing/sharing';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const props = defineProps({
  docRef: {
    type: Object,
    required: true,
  },
  user: {
    type: Object,
    required: true,
  },
});

const error = ref(undefined);

const dialogStackStore = useDialogStackStore();

async function transfer() {
  try {
    await transferOwnership.callAsync({
      docRef: props.docRef,
      userId: props.user._id
    });
    error.value = undefined;
    await dialogStackStore.popDialogStack();
  } catch (e) {
    error.value = e.reason || e.message || e.toString();
  }
}
</script>

<style lang="css" scoped>
</style>
