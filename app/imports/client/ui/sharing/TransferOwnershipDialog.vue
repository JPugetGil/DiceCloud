<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('sharing.transferOwnership') }}
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
          {{ $t('sharing.transferConfirm', { user: user.username || user._id }) }}
        </p><p>
          {{ $t('sharing.transferUndo') }}
        </p><p>
          {{ $t('sharing.stillEdit') }}
        </p>
      </template>
    </v-alert>
    <div class="d-flex flex-1-1 justify-center">
      <v-btn
        color="accent"
        @click="transfer"
      >
        {{ $t('sharing.transfer') }}
        <template v-if="user.username">
          {{ $t('sharing.toUser', { user: user.username }) }}
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
