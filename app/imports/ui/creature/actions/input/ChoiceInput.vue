<template>
  <div class="choice-input">
    <v-expansion-panels
      variant="accordion"
      tile
      multiple
    >
      <v-expansion-panel
        v-for="prop in choices"
        :key="prop._id"
        :model="prop"
        :data-id="prop._id"
      >
        <v-expansion-panel-title>
          <template #default="{ open }">
            <v-checkbox
              v-model="model"
              class="my-0 py-0 mr-2 flex-grow-0"
              hide-details
              :value="prop._id"
              :disabled="!model.includes(prop._id) && model.length >= quantity.max"
              @click.stop
            />
            <tree-node-view :model="prop" />
            <template v-if="open">
              <v-spacer />
              <v-btn
                variant="text"
                icon
                class="flex-grow-0"
                @click.stop="openPropertyDetails(prop._id)"
              >
                <v-icon>mdi-window-restore</v-icon>
              </v-btn>
            </template>
          </template>
        </v-expansion-panel-title>
        <v-expansion-panel-text class="py-4">
          <property-viewer :model="prop" />
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
    <v-btn
      :disabled="!canContinue"
      @click="emit('continue')"
    >
      {{ $t('common.done') }}
    </v-btn>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import TreeNodeView from '/imports/ui/properties/treeNodeViews/TreeNodeView.vue';
import PropertyViewer from '/imports/ui/properties/shared/PropertyViewer.vue';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  choices: {
    type: Array,
    required: true,
  },
  quantity: {
    type: Object,
    default: () => ({ min: 0, max: 1 }),
  },
});

// The ids of the chosen properties
const model = defineModel({
  type: Array,
  default: () => [],
});

const emit = defineEmits(['continue']);

const canContinue = computed(() => {
  return model.value.length >= (props.quantity?.min ?? 0);
});

function openPropertyDetails(id) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: id,
    data: {
      _id: id,
    },
  });
}
</script>