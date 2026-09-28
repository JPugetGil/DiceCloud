<template>
  <dialog-base
    v-if="model"
    :color="model.color"
  >
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('creatureForm.characterDetails') }}
      </v-toolbar-title>
      <v-spacer />
      <color-picker
        :value="model.color"
        no-color-change
        @input="value => change({path: ['color'], value})"
      />
    </template>
    <div>
      <creature-form
        :model="model"
        :disabled="editPermission === false"
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
import { Meteor } from 'meteor/meteor';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import Creatures from '/imports/api/creature/creatures/Creatures';
import updateCreature from '/imports/api/creature/creatures/methods/updateCreature';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import CreatureForm from '/imports/client/ui/creature/CreatureForm.vue';
import ColorPicker from '/imports/client/ui/components/ColorPicker.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  _id: {
    type: String,
    required: true,
  },
  startInEditTab: Boolean,
});


const model = autorun(() => Creatures.findOne(props._id)).result;
const editPermission = autorun(() => hasEditPermission(model.value, Meteor.user())).result;

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
