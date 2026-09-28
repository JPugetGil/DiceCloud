<template>
  <dialog-base
    :color="model?.color"
    dark-body
  >
    <template #toolbar>
      <v-toolbar-title>
        {{ model?.name }}
      </v-toolbar-title>
      <v-spacer />
      <v-text-field
        v-model="searchInput"
        prepend-inner-icon="mdi-magnify"
        regular
        clearable
        hide-details
        class="flex-grow-0"
        style="flex-basis: 300px;"
        :loading="searchLoading"
        @change="searchValue = searchInput || undefined"
        @click:clear="searchValue = undefined"
      />
    </template>
    <property-description
      text
      :string="model?.description"
    />
    <p>
      <property-tags
        v-for="(tags, index) in tagsSearched.or"
        :key="index"
        :tags="tags"
        :prefix="index ? $t('common.or') : undefined"
      />
      <property-tags
        v-for="(tags, index) in tagsSearched.not"
        :key="index"
        :tags="tags"
        :prefix="$t('common.not')"
      />
    </p>
    <v-expansion-panels
      multiple
      variant="inset"
    >
      <template
        v-for="libraryNode in libraryNodes"
        :key="libraryNode._id"
      >
        <v-expansion-panel
          v-if="showDisabled || !libraryNode._disabledBySlotFillerCondition"
          :model="libraryNode"
          :data-id="libraryNode._id"
          :class="{disabled: isDisabled(libraryNode) || libraryNode._disabledBySlotFillerCondition}"
        >
          <v-expansion-panel-title>
            <template #default="{ open }">
              <div class="d-flex align-center flex-grow-0 mr-2">
                <v-checkbox
                  v-if="libraryNode._disabledByAlreadyAdded"
                  class="my-0 py-0"
                  hide-details
                  :model-value="true"
                  disabled
                />
                <v-checkbox
                  v-else
                  v-model="selectedNodeIds"
                  class="my-0 py-0"
                  hide-details
                  :color="libraryNode._disabledBySlotFillerCondition ? 'error' : ''"
                  :disabled="isDisabled(libraryNode)"
                  :value="libraryNode._id"
                  @click.stop
                />
              </div>
              <div class="d-flex flex-1-1 flex-column">
                <div class="d-flex flex-1-1 align-center">
                  <tree-node-view :model="libraryNode" />
                  <div
                    v-if="libraryNode._disabledBySlotFillerCondition"
                    class="text-error text-no-wrap text-truncate"
                  >
                    {{ libraryNode._conditionError }}
                  </div>
                </div>
                <div class="text-caption text-no-wrap text-truncate">
                  {{ libraryNames[libraryNode.root.id ] }}
                </div>
              </div>
              <div
                v-if="libraryNode.slotQuantityFilled !== undefined && libraryNode.slotQuantityFilled !== 1"
                class="text-overline flex-grow-0 text-no-wrap"
                :class="{
                  'text-error': isDisabled(libraryNode) &&
                    libraryNode._disabledByQuantityFilled
                }"
              >
                {{ $t('slots.slotCount', { count: libraryNode.slotQuantityFilled }) }}
              </div>
              <template v-if="open">
                <v-btn
                  variant="text"
                  icon
                  class="flex-grow-0"
                  @click.stop="openPropertyDetails(libraryNode._id)"
                >
                  <v-icon>mdi-window-restore</v-icon>
                </v-btn>
              </template>
            </template>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <library-node-expansion-content :id="libraryNode._id" />
          </v-expansion-panel-text>
        </v-expansion-panel>
      </template>
    </v-expansion-panels>
    <div
      v-if="(!classFillersReady && !searchValue) || currentLimit < countAll"
      class="d-flex flex-1-1 flex-column align-center justify-center ma-3 mt-8"
    >
      <v-btn
        :loading="!classFillersReady"
        color="accent"
        variant="outlined"
        @click="loadMore"
      >
        {{ $t('common.loadMore') }}
      </v-btn>
    </div>
    <template v-if="!showDisabled && disabledNodeCount">
      <div class="d-flex flex-1-1 flex-column align-center justify-center ma-3">
        <div>
          {{ $t('slots.requirementsNotMet', { count: disabledNodeCount }) }}
        </div>
        <v-btn
          class="mt-2"
          elevation="0"
          color="accent"
          @click="showDisabled = true"
        >
          {{ $t('common.showAll') }}
        </v-btn>
      </div>
    </template>
    <template #actions>
      <v-btn
        variant="text"
        @click="dialogStackStore.popDialogStack()"
      >
        {{ $t('common.cancel') }}
      </v-btn>
      <v-spacer />
      <v-btn
        variant="text"
        color="primary"
        :disabled="!dummySlot && !selectedNodeIds.length"
        @click="dialogStackStore.popDialogStack(selectedNodeIds)"
      >
        <template v-if="model?.spaceLeft">
          {{ totalQuantitySelected }} / {{ model.spaceLeft }}
        </template>
        <template v-if="classId">
          {{ $t('common.insert') }}
        </template>
        <template v-else>
          {{ $t('slots.closeTest') }}
        </template>
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref, computed, watch, provide, reactive } from 'vue';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { EJSON } from 'meteor/ejson';
import subscriptionData from '/imports/client/ui/utility/subscriptionData';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import TreeNodeView from '/imports/client/ui/properties/treeNodeViews/TreeNodeView.vue';
import PropertyDescription from '/imports/client/ui/properties/viewers/shared/PropertyDescription.vue'
import evaluateSlotFillerConditions from '/imports/client/ui/creature/slots/slotFillerConditions';
import Libraries from '/imports/api/library/Libraries';
import LibraryNodeExpansionContent from '/imports/client/ui/library/LibraryNodeExpansionContent.vue';
import PropertyTags from '/imports/client/ui/properties/viewers/shared/PropertyTags.vue';
import { clone, difference, isEqual } from 'lodash';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();


const props = defineProps({
  classId: {
    type: String,
    default: undefined,
  },
  creatureId: {
    type: String,
    default: undefined,
  },
  dummySlot: {
    type: Object,
    default: undefined,
  },
});


const selectedNodeIds = ref([]);
const searchInput = ref(undefined);
const searchValue = ref(undefined);
const showDisabled = ref(false);

provide('context', reactive({
  creatureId: computed(() => props.creatureId),
}));

const { ready: classFillersReady, sub: classFillersSubHandle } = subscribe(() => ['classFillers', props.classId, searchValue.value || undefined]);

const searchLoading = autorun(() => !!searchValue.value && !classFillersReady.value).result;

const model = autorun(() => {
  if (props.classId) {
    return CreatureProperties.findOne(props.classId);
  } else if (props.dummySlot) {
    let m = clone(props.dummySlot);
    if (!m.quantityExpected) m.quantityExpected = {};
    m.quantityExpected.value = +m.quantityExpected.calculation;
    m.spaceLeft = m.quantityExpected.value;
    return m;
  }
}).result;

const variables = autorun(() => {
  if (!props.creatureId) return {};
  return CreatureVariables.findOne({ _creatureId: props.creatureId }) || {};
}).result;

const currentLimit = autorun(() => subscriptionData(classFillersSubHandle, 'limit') || 50).result;
const countAll = autorun(() => subscriptionData(classFillersSubHandle, 'countAll')).result;

const tagsSearched = computed(() => {
  let or = [];
  let not = [];
  if (model.value?.slotTags && model.value.slotTags.length) {
    or.push(model.value.slotTags);
  }
  model.value?.extraTags?.forEach(extras => {
    if (extras.tags?.length) {
      if (extras.operation === 'OR') {
        or.push(extras.tags);
      } else if (extras.operation === 'NOT') {
        not.push(extras.tags);
      }
    }
  });
  return { or, not };
});

const filledLevels = computed(() => {
  return LibraryNodes.find({
    _id: { $in: selectedNodeIds.value }
  }).map(
    node => node.level || node.cache?.node?.level || 0
  ).sort((a, b) => a - b);
});

const alreadyAdded = autorun(() => {
  let added = new Set();
  if (!model.value?.unique) return added;
  let ancestorId;
  if (model.value.unique === 'uniqueInSlot') {
    ancestorId = model.value._id;
  } else if (model.value.unique === 'uniqueInCreature') {
    ancestorId = props.creatureId;
  }
  CreatureProperties.find({
    ...getFilter.descendants(ancestorId),
    libraryNodeId: { $exists: true },
    removed: { $ne: true },
  }, {
    fields: { libraryNodeId: 1 },
  }).forEach(prop => {
    added.add(prop.libraryNodeId);
  });
  return added;
}).result;

const totalQuantitySelected = autorun(() => {
  let quantitySelected = 0;
  LibraryNodes.find({
    _id: { $in: selectedNodeIds.value }
  }, {
    fields: { slotQuantityFilled: 1 },
  }).forEach(node => {
    if (Number.isFinite(node.slotQuantityFilled)) {
      quantitySelected += node.slotQuantityFilled;
    } else {
      quantitySelected += 1;
    }
  });
  return quantitySelected;
}).result;

const spaceLeft = autorun(() => {
  if (!model.value?.quantityExpected || model.value.quantityExpected.value === 0) return undefined;
  return model.value.spaceLeft - totalQuantitySelected.value;
}).result;

const libraryNames = autorun(() => {
  let names = {};
  Libraries.find().forEach(lib => names[lib._id] = lib.name);
  return names;
}).result;

const libraryNodeFilter = autorun(() => {
  const filterString = subscriptionData(classFillersSubHandle, 'libraryNodeFilter');
  if (!filterString) return;
  return EJSON.parse(filterString);
}).result;

// Class levels that match, flagged with what can be decided synchronously
const matchingNodes = autorun(() => {
  if (!libraryNodeFilter.value) return [];
  if (!classFillersReady.value) return [];
  let nodes = LibraryNodes.find(libraryNodeFilter.value, {
    sort: { level: 1, name: 1, order: 1 }
  }).fetch();
  // Mark classFillers that are too big to fit the quantity to fill
  nodes.forEach(node => {
    if (node.cache?.node) {
      node.level = node.cache.node.level;
    }
    let quantityToFill = node.type === 'slotFiller' ? node.slotQuantityFilled : 1;
    if (
      quantityToFill > spaceLeft.value
    ) {
      node._disabledByQuantityFilled = true;
    }
    if (alreadyAdded.value.has(node._id)) {
      node._disabledByAlreadyAdded = true;
    }
  });
  nodes.sort((a, b) => a.level - b.level);
  return nodes;
}).result;

// slotFillerCondition needs the async parser, so its verdicts arrive separately
const conditionErrors = ref(new Map());
watch([matchingNodes, variables], async () => {
  const nodes = matchingNodes.value;
  const errors = await evaluateSlotFillerConditions(nodes, variables.value);
  if (nodes !== matchingNodes.value) return;
  conditionErrors.value = errors;
}, { immediate: true });

const libraryNodes = computed(() => (matchingNodes.value || []).map(node => {
  const conditionError = conditionErrors.value.get(node._id);
  if (!conditionError) return node;
  return {
    ...node,
    _disabledBySlotFillerCondition: true,
    _conditionError: conditionError,
  };
}));

const disabledNodeCount = computed(() => libraryNodes.value
  .filter(node => node._disabledBySlotFillerCondition).length);

const activeCount = autorun(() => {
  if (!libraryNodes.value) return;
  return libraryNodes.value.length - (disabledNodeCount.value || 0);
}).result;

watch(selectedNodeIds, (newVal, oldVal) => {
  let selectedIds = [...newVal];
  let oldSelectedIds = oldVal ? [...oldVal] : [];

  // Skip if we increased the length by adding a new Id, see if we need to backfill levels
  if (oldSelectedIds.length < selectedIds.length) {
    // Find out which library node was added
    const addedId = difference(selectedIds, oldSelectedIds)[0];
    if (addedId) {
      const addedNode = LibraryNodes.findOne(addedId);
      if (addedNode) {
        // Check which levels are already backfilled
        const backFilledLevels = new Set();
        LibraryNodes.find({
          _id: { $in: selectedIds }
        }).map(node => backFilledLevels.add(node.level || node.cache?.node?.level || 0));
        // Tick any unchecked nodes of a lower level, but only one per level
        libraryNodes.value.forEach(node => {
          if (
            !selectedIds.includes(node._id)
            && (node.level < addedNode.level)
            && !backFilledLevels.has(node.level)
            && !isDisabled(node)
            && !node._disabledBySlotFillerCondition
          ) {
            selectedIds.push(node._id);
            backFilledLevels.add(node.level);
          }
        });
      }
    }
  }

  // Refetch the library nodes to sort them correctly
  const sortedIds = LibraryNodes.find({
    _id: { $in: selectedIds }
  }, {
    sort: { level: 1, name: 1, order: 1 }
  })
    .fetch()
    .sort((a, b) => (a.level || a.cache?.node?.level || 0) - (b.level || b.cache?.node?.level || 0))
    .map(node => node._id);
  // Only update if the order changed
  if (!isEqual(selectedNodeIds.value, sortedIds)) {
    selectedNodeIds.value = sortedIds;
  }
});

watch(activeCount, (val) => {
  // Still loading fillers
  if (!classFillersReady.value) return;
  // Can load more, and not showing enough active choices, so load more
  if (
    currentLimit.value < countAll.value
    && val < 20
  ) {
    loadMore();
  }
});

function loadMore() {
  if (currentLimit.value >= countAll.value) return;
  classFillersSubHandle.value?.setData('limit', currentLimit.value + 50);
}

function openPropertyDetails(id) {
  dialogStackStore.pushDialogStack({
    component: 'library-node-dialog',
    elementId: id,
    data: {
      _id: id,
    },
  });
}

function isDisabled(node) {
  const selected = selectedNodeIds.value.includes(node._id);
  return node._disabledByAlreadyAdded
    || (node._disabledByQuantityFilled && !selected)
    || (filledLevels.value.includes(node.level || node.cache?.node?.level || 0) && !selected);
}
</script>

<style lang="css" scoped>
.disabled {
  opacity: 0.7;
}
</style>
.result