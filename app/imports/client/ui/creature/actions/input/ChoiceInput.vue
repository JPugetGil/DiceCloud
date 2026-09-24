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
              v-model="selectedItems"
              class="my-0 py-0 mr-2 flex-grow-0"
              hide-details
              :value="prop._id"
              :disabled="!selectedItems.includes(prop._id) && selectedItems.length >= quantity.max"
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
      Done
    </v-btn>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import TreeNodeView from '/imports/client/ui/properties/treeNodeViews/TreeNodeView.vue';
import PropertyViewer from '/imports/client/ui/properties/shared/PropertyViewer.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

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
  modelValue: {
    type: Array,
    default: undefined,
  },
  value: {
    type: Array,
    default: undefined,
  },
});

const emit = defineEmits(['continue', 'input', 'update:modelValue']);


const selectedItems = ref(props.modelValue || props.value || []);

const canContinue = computed(() => {
  return selectedItems.value.length >= (props.quantity?.min ?? 0);
});

watch(
  () => props.modelValue ?? props.value,
  (val) => {
    if (val !== undefined && val !== selectedItems.value) {
      selectedItems.value = [...val];
    }
  }
);

watch(selectedItems, (val) => {
  emit('input', val);
  emit('update:modelValue', val);
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