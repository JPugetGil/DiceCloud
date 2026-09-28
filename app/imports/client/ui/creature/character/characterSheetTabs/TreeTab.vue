<template>
  <div
    class="tree-tab pa-4 d-flex flex-1-1 flex-column align-center"
    style="height: calc(100vh - 96px); display: flex;"
  >
    <v-card
      style="height: 100%; width: 100%; max-width: 1800px;"
      data-id="creature-tree-card"
    >
      <tree-detail-layout>
        <template #tree>
          <v-toolbar
            flat
            theme="dark"
            style="flex-grow: 0;"
          >
            <tree-search-input
              ref="searchBox"
              v-model="filter"
              class="mx-4"
            />
            <v-spacer />
            <v-switch
              v-if="context.editPermission !== false"
              v-model="organize"
              hide-details
              density="compact"
              :label="$t('tree.organize')"
              class="mx-3"
              :disabled="organizeDisabled"
              style="flex-grow: 0;"
            />
          </v-toolbar>
          <creature-properties-tree
            class="pt-2 flex-1-1"
            style="overflow-y: auto;"
            :root="{collection: 'creatures', id: creatureId}"
            :organize="organize"
            :selected-node="selectedNode"
            :filter="filter"
            @selected="clickNode"
          />
        </template>
        <template #detail>
          <creature-property-dialog
            embedded
            :_id="selectedNodeId"
            @removed="selectedNodeId = undefined"
            @duplicated="id => selectedNodeId = id"
            @select-sub-property="clickNode"
          />
        </template>
      </tree-detail-layout>
    </v-card>
  </div>
</template>

<script setup lang="js">
import { ref, watch, inject } from 'vue';
import { useDisplay } from 'vuetify';
import { autorun } from 'vue-meteor-tracker';
import TreeDetailLayout from '/imports/client/ui/components/TreeDetailLayout.vue';
import CreaturePropertiesTree from '/imports/client/ui/creature/creatureProperties/CreaturePropertiesTree.vue';
import CreaturePropertyDialog from '/imports/client/ui/creature/creatureProperties/CreaturePropertyDialog.vue';
import TreeSearchInput from '/imports/client/ui/components/tree/TreeSearchInput.vue';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

defineProps({
  creatureId: {
    type: String,
    required: true,
  },
});

const context = inject('context', {});
const display = useDisplay();

const organize = ref(false);
const organizeDisabled = ref(false);
const selectedNodeId = ref(undefined);
const filter = ref(undefined);

watch(filter, (newFilter) => {
  if (newFilter) {
    organize.value = false;
    organizeDisabled.value = true;
  } else {
    organizeDisabled.value = false;
  }
});

watch(display.mdAndUp, (mdAndUp) => {
  if (!mdAndUp) {
    selectedNodeId.value = undefined;
  }
});

function clickNode(id) {
  if (display.mdAndUp.value) {
    selectedNodeId.value = id;
  } else {
    dialogStackStore.pushDialogStack({
      component: 'creature-property-dialog',
      elementId: `tree-node-${id}`,
      data: {
        _id: id,
      },
    });
  }
}


const { result: selectedNode } = autorun(() => {
  return CreatureProperties.findOne({
    _id: selectedNodeId.value,
    removed: { $ne: true },
  });
});
</script>

<style lang="css" scoped>
</style>
