<template>
  <dialog-base
    v-if="model"
    :color="model.color"
  >
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('creatureForm.characterDetails') }}
      </v-toolbar-title>
      <color-picker
        :model-value="model.color"
        no-color-change
        @update:model-value="value => change({path: ['color'], value})"
      />
    </template>
    <div>
      <creature-form
        :model="model"
        @change="change"
      />
    </div>
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
import { autorun } from 'vue-meteor-tracker';
import Creatures from '/imports/api/creature/creatures/Creatures';
import updateCreature from '/imports/api/creature/creatures/methods/updateCreature';
import DialogBase from '/imports/ui/dialogStack/DialogBase.vue';
import CreatureForm from '/imports/ui/creature/CreatureForm.vue';
import ColorPicker from '/imports/ui/components/ColorPicker.vue';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  _id: {
    type: String,
    required: true,
  },
});


const model = autorun(() => Creatures.findOne(props._id)).result;

async function change({ path, value, ack }) {
  try {
    await updateCreature.callAsync({ _id: props._id, path, value });
    if (ack) {
      ack();
    }
  } catch (error) {
    if (ack) {
      ack(error && error.reason || error)
    } else {
      console.error(error)
    }
  }
}
</script>

<style lang="css" scoped>

</style>
