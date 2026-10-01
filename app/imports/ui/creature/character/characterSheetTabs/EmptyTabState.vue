<template>
  <v-card
    class="empty-tab-state mx-auto my-4"
    data-id="empty-tab-state"
  >
    <v-empty-state
      :icon="icon"
      :title="title"
      :text="text"
    >
      <template #actions>
        <v-btn
          v-if="choicesLeft > 0"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-hammer-wrench"
          @click="appStore.setTabForCharacterSheet({ id: creatureId, tab: 'build' })"
        >
          {{ $t('build.continueBuilding') }}
        </v-btn>
        <v-btn
          v-if="type && context.editPermission !== false"
          variant="text"
          prepend-icon="mdi-plus"
          :data-id="`empty-tab-add-${type}`"
          @click="add"
        >
          {{ addLabel }}
        </v-btn>
      </template>
    </v-empty-state>
  </v-card>
</template>

<script setup>
/**
 * What an empty character sheet tab shows: what belongs there and where it
 * comes from, a way back to the Build tab while choices are left, and a way
 * to add one property of the tab's kind, as the floating button does.
 */
import { computed, inject } from 'vue';
import { useAppStore } from '/imports/ui/stores/app';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import useBuildProgress from '/imports/ui/composables/useBuildProgress';
import insertProperty from '/imports/api/creature/creatureProperties/methods/insertProperty';
import insertPropertyFromLibraryNode from '/imports/api/creature/creatureProperties/methods/insertPropertyFromLibraryNode';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';

const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
  icon: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  // The property type the add button inserts, if any
  type: {
    type: String,
    default: undefined,
  },
  addLabel: {
    type: String,
    default: undefined,
  },
});

const appStore = useAppStore();
const dialogStackStore = useDialogStackStore();
const context = inject('context', {});

const buildProgress = useBuildProgress(() => props.creatureId);
const choicesLeft = computed(() => context.editPermission === false
  ? 0
  : (buildProgress.value?.total || 0) - (buildProgress.value?.done || 0));

function add() {
  const parentRef = { id: props.creatureId, collection: 'creatures' };
  dialogStackStore.pushDialogStack({
    component: 'insert-property-dialog',
    elementId: `empty-tab-add-${props.type}`,
    data: {
      forcedType: props.type,
      creatureId: props.creatureId,
      noBackdropClose: true,
    },
    async callback(result) {
      if (!result) return `empty-tab-add-${props.type}`;
      try {
        if (Array.isArray(result)) {
          return await insertPropertyFromLibraryNode.callAsync({ nodeIds: result, parentRef });
        }
        return await insertProperty.callAsync({ creatureProperty: result, parentRef });
      } catch (error) {
        console.error(error);
        snackbar({ text: error.reason || error.message || error.toString() });
      }
    },
  });
}
</script>

<style scoped>
.empty-tab-state {
  max-width: 560px;
}
</style>
