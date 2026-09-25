<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('deleteCharacter.title') }}
      </v-toolbar-title>
    </template>
    <div>
      <p v-if="name">
        {{ $t('deleteCharacter.typeName', { name }) }}
      </p>
      <v-text-field
        v-if="name"
        v-model="inputName"
      />
      <v-btn
        v-show="nameMatch"
        class="bg-primary"
        :loading="removing"
        @click="remove"
      >
        {{ $t('deleteCharacter.deleteForever') }}
      </v-btn>
    </div>
    <template #actions>
      <v-spacer />
      <v-btn
        variant="text"
        @click="dialogStackStore.popDialogStack()"
      >
        {{ $t('common.cancel') }}
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref, computed } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import { useRouter } from 'vue-router';

import Creatures from '/imports/api/creature/creatures/Creatures';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import removeCreature from '/imports/api/creature/creatures/methods/removeCreature';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  id: {
    type: String,
    default: undefined,
  },
});

const router = useRouter();

const inputName = ref(undefined);
const removing = ref(false);

const name = autorun(() => {
  let creature = Creatures.findOne(props.id, { fields: { name: 1 } });
  return creature && creature.name;
}).result;

const nameMatch = computed(() => {
  if (!name.value) return true;
  let uppername = name.value.toUpperCase();
  let upperInputName = inputName.value && inputName.value.toUpperCase();
  return uppername === upperInputName;
});

async function remove() {
  removing.value = true;
  try {
    await removeCreature.callAsync({ charId: props.id });
    await router.push('/characterList');
    await dialogStackStore.popDialogStack();
  } catch (error) {
    console.error(error);
    snackbar({ text: error.message || error.toString() });
  } finally {
    removing.value = false;
  }
}
</script>

<style lang="css" scoped>

</style>
