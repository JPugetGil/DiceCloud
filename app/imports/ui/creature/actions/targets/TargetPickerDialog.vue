<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ propName ? $t('targetPicker.titleFor', { name: propName }) : $t('targetPicker.title') }}
      </v-toolbar-title>
    </template>
    <div data-id="target-picker-dialog">
      <div
        v-if="!ready"
        class="d-flex justify-center pa-4"
      >
        <v-progress-circular
          indeterminate
          :aria-label="$t('targetPicker.loading')"
        />
      </div>
      <target-picker
        v-else
        v-model="targetIds"
        :candidates="candidates"
        :actor-id="creatureId"
        :single="single"
      />
    </div>
    <template #actions>
      <v-btn
        variant="text"
        @click="dialogStackStore.popDialogStack()"
      >
        {{ $t('common.cancel') }}
      </v-btn>
      <v-spacer />
      <v-btn
        variant="flat"
        color="primary"
        prepend-icon="mdi-target"
        :disabled="!creatureId || !propId || !ready"
        :loading="busy"
        data-id="target-picker-confirm"
        @click="confirm"
      >
        {{ targetIds.length
          ? $t('targetPicker.applyTo', { count: targetIds.length }, targetIds.length)
          : $t('targetPicker.applyWithoutTarget') }}
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import DialogBase from '/imports/ui/dialogStack/DialogBase.vue';
import TargetPicker from '/imports/ui/creature/actions/targets/TargetPicker.vue';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { partiesOf, targetCandidates, withPartyBoards } from '/imports/ui/creature/actions/targets/targetCandidates';
import { useTargetSelectionStore } from '/imports/ui/stores/targetSelection';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import doAction from '/imports/ui/creature/actions/doAction';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';

/**
 * The target picker before an action (phase 2.1 of the monsters, Q1): by
 * itself for a targeted action during a fight, preselected on its last
 * targets or the board's pick; from "Target…" otherwise. Lists the
 * creatures of the actor's parties the user may target, once their boards
 * are in (partyBoard); then applies the action to them (doAction), the
 * action's own dialog taking this one's place if it asks for something.
 */
const props = defineProps({
  creatureId: {
    type: String,
    default: undefined,
  },
  propId: {
    type: String,
    default: undefined,
  },
  single: Boolean,
  // Opened by itself during a fight: the fighting parties' creatures alone
  fighting: Boolean,
  // During a fight: the action's last targets, or the board's pick
  preselect: Boolean,
});

const dialogStackStore = useDialogStackStore();
const targetStore = useTargetSelectionStore();

const propName = autorun(() => props.propId && CreatureProperties.findOne(props.propId, { fields: { name: 1 } })?.name).result;

// The parties, and each one's board: its creatures, and their variables for
// the action's simulation
const partiesReady = autorun(() => !props.creatureId
  || Meteor.subscribe('characterParties', props.creatureId).ready()).result;
const parties = autorun(() => partiesOf(props.creatureId, { fighting: props.fighting })).result;
const boardsReady = autorun(() => {
  const handles = (parties.value || []).map(party => Meteor.subscribe('partyBoard', party._id));
  return handles.every(handle => handle.ready());
}).result;
const ready = computed(() => !props.creatureId || (partiesReady.value && boardsReady.value));

const candidates = autorun(() => props.creatureId ? targetCandidates(props.creatureId, parties.value || []) : []).result;

const targetIds = ref([]);
// Once the candidates are in: the preselection, during a fight
let preselected = false;
watch(ready, isReady => {
  if (!isReady || preselected) return;
  preselected = true;
  if (!props.preselect) return;
  targetIds.value = targetStore.preselection({
    propId: props.propId,
    folderIds: (parties.value || []).map(party => party._id),
    candidateIds: (candidates.value || []).map(creature => creature._id),
    single: props.single,
  });
}, { immediate: true });

const busy = ref(false);
async function confirm() {
  const ids = [...targetIds.value];
  targetStore.remember(props.propId, ids);
  busy.value = true;
  try {
    await withPartyBoards(parties.value || [], () => doAction({
      creatureId: props.creatureId,
      propId: props.propId,
      targetIds: ids,
      elementId: 'target-picker-confirm',
      replaceDialog: true,
    }));
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message || error.toString() });
  } finally {
    busy.value = false;
  }
}
</script>
