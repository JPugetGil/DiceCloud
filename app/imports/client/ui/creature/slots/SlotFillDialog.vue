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
        @change="searchValue = (searchInput && searchInput.trim()) || undefined"
        @click:clear="searchValue = undefined"
      />
    </template>
    <property-description
      text
      :string="model?.description"
    />
    <p>
      {{ slotPropertyTypeName }} with library tags:
      <property-tags
        v-for="(tags, index) in tagsSearched.or"
        :key="index + 'tags'"
        :tags="tags"
        :prefix="index ? 'OR' : undefined"
      />
      <property-tags
        v-for="(tags, index) in tagsSearched.not"
        :key="index + 'not'"
        :tags="tags"
        prefix="NOT"
      />
    </p>
    <v-fade-transition>
      <div
        v-if="!slotFillersReady"
        class="fill-height d-flex flex-1-1 justify-center align-center"
      >
        <v-progress-circular
          indeterminate
          color="primary"
          size="64"
        />
      </div>
      <v-expansion-panels
        v-else
        variant="accordion"
        tile
        multiple
      >
        <template
          v-for="libraryNode in [...(selectedExcludedNodes || []), ...(libraryNodes || [])]"
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
                    {{ libraryNames?.[libraryNode.root.id ] }}
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
                  {{ libraryNode.slotQuantityFilled }} slots
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
    </v-fade-transition>
    <div
      v-if="(!slotFillersReady && !searchValue) || currentLimit < countAll"
      class="d-flex flex-1-1 flex-column align-center justify-center ma-3 mt-8"
    >
      <v-btn
        :loading="!slotFillersReady"
        color="accent"
        variant="outlined"
        @click="loadMore"
      >
        Load More
      </v-btn>
    </div>
    <template v-if="!showDisabled && disabledNodeCount">
      <div class="d-flex flex-1-1 flex-column align-center justify-center ma-3 mt-8">
        <div>
          Requirements of {{ disabledNodeCount }} properties were not met
        </div>
        <v-btn
          class="mt-2"
          elevation="0"
          color="accent"
          variant="outlined"
          @click="showDisabled = true"
        >
          Show All
        </v-btn>
      </div>
    </template>
    <div class="d-flex flex-1-1 align-center justify-center text-caption text-disabled mt-8 mb-2">
      Can't find what you're looking for?
    </div>
    <div class="d-flex flex-1-1 align-center justify-center flex-wrap mx-4 mb-4">
      <v-btn
        v-if="!dummySlot"
        variant="text"
        size="small"
        data-id="library-browser-button"
        :disabled="!model"
        @click="openLibraryBrowser"
      >
        Browse community libraries
      </v-btn>
      <v-btn
        v-if="!dummySlot"
        variant="text"
        size="small"
        :disabled="!model"
        data-id="custom-button"
        @click="insertCustomFiller"
      >
        Create custom filler
      </v-btn>
    </div>

    <template #actions>
      <v-btn
        variant="text"
        @click="dialogStackStore.popDialogStack()"
      >
        Cancel
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
        <template v-if="slotId">
          Insert
        </template>
        <template v-else>
          Close Test
        </template>
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup lang="js">
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
import resolve from '/imports/parser/resolve';
import toString from '/imports/parser/toString';
import { prettifyParseError, parse } from '/imports/parser/parser';
import Libraries from '/imports/api/library/Libraries';
import LibraryNodeExpansionContent from '/imports/client/ui/library/LibraryNodeExpansionContent.vue';
import PropertyTags from '/imports/client/ui/properties/viewers/shared/PropertyTags.vue';
import { getPropertyName } from '/imports/constants/PROPERTIES';
import { clone, difference } from 'lodash';
import getDefaultSlotFiller from '/imports/api/library/methods/getDefaultSlotFiller';
import insertPropertyFromLibraryNode from '/imports/api/creature/creatureProperties/methods/insertPropertyFromLibraryNode';
import insertProperty from '/imports/api/creature/creatureProperties/methods/insertProperty';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  slotId: {
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
const disabledNodeCount = ref(0);
const autoSelectRan = ref(false);

provide('context', reactive({
  get creatureId() { return props.creatureId; }
}));

const { ready: slotFillersReady, sub: slotFillersSubHandle } = subscribe(() => ['slotFillers', props.slotId || props.dummySlot?._id, searchValue.value || undefined, !!props.dummySlot]);
subscribe(() => ['selectedFillers', props.slotId || props.dummySlot?._id, selectedNodeIds.value, !!props.dummySlot]);

const searchLoading = computed(() => !!searchValue.value && !slotFillersReady.value);

const model = autorun(() => {
  if (props.slotId) {
    return CreatureProperties.findOne(props.slotId);
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

const currentLimit = computed(() => subscriptionData(slotFillersSubHandle, 'limit') || 50);
const countAll = computed(() => subscriptionData(slotFillersSubHandle, 'countAll'));

const libraryNodeFilter = computed(() => {
  const filterString = subscriptionData(slotFillersSubHandle, 'libraryNodeFilter');
  if (!filterString) return;
  return EJSON.parse(filterString);
});

const alreadyAdded = autorun(() => {
  let added = new Set();
  if (!model.value || !model.value.unique) return added;
  let rootId;
  if (model.value.unique === 'uniqueInSlot') {
    rootId = model.value._id;
  } else if (model.value.unique === 'uniqueInCreature') {
    rootId = props.creatureId;
  }
  CreatureProperties.find({
    'root.id': rootId,
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

const spaceLeft = computed(() => {
  if (!model.value || !model.value.quantityExpected || model.value.quantityExpected.value === 0) return undefined;
  return model.value.spaceLeft - (totalQuantitySelected.value || 0);
});

const libraryNames = autorun(() => {
  let names = {};
  Libraries.find().forEach(lib => names[lib._id] = lib.name)
  return names;
}).result;

const libraryNodes = autorun(() => {
  if (!libraryNodeFilter.value) return [];
  if (!slotFillersReady.value) return [];
  let nodes = LibraryNodes.find(libraryNodeFilter.value, {
    sort: { name: 1, order: 1 }
  }).fetch();
  let count = 0;
  nodes.forEach(async node => {
    if (node.slotFillerCondition) {
      try {
        let parseNode = parse(node.slotFillerCondition);
        const { result: resultNode } = await resolve('reduce', parseNode, variables.value);
        if (resultNode?.parseType === 'constant') {
          if (!resultNode.value) {
            node._disabled = true;
            node._disabledBySlotFillerCondition = true;
            node._conditionError = node.slotFillerConditionNote || node.slotFillerCondition;
            count += 1;
          }
        } else {
          node._disabled = true;
          node._disabledBySlotFillerCondition = true;
          node._conditionError = node.slotFillerConditionNote || toString(resultNode);
            count += 1;
        }
      } catch (e) {
        console.warn(e);
        let error = prettifyParseError(e);
        node._disabled = true;
        node._disabledBySlotFillerCondition = true;
        node._conditionError = 'Condition error: '+ error;
        count += 1;
      }
    }
    let quantityToFill = typeof node.slotQuantityFilled == 'number' ? node.slotQuantityFilled : 1;
    if (
      quantityToFill > spaceLeft.value
    ) {
      node._disabled = true;
      node._disabledByQuantityFilled = true;
    }
    if (alreadyAdded.value?.has(node._id)) {
      node._disabled = true;
      node._disabledByAlreadyAdded = true;
    }
  });
  if (!autoSelectRan.value) {
    autoSelectRan.value = true;
    if (
      nodes.length === 1
      && !nodes[0]._disabled
      && !selectedNodeIds.value?.length
    ) {
      selectedNodeIds.value = [nodes[0]._id];
    }
  }
  disabledNodeCount.value = count;
  return nodes;
}).result;

const selectedExcludedNodes = autorun(() => {
  const displayedIds = (libraryNodes.value || []).map(node => node._id);
  const excludedNodeIds = difference(selectedNodeIds.value, displayedIds);
  return LibraryNodes.find({ _id: { $in: excludedNodeIds } }).fetch();
}).result;

const activeCount = computed(() => {
  if (!libraryNodes.value) return;
  return libraryNodes.value.length - (disabledNodeCount.value || 0);
});

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

const slotPropertyTypeName = computed(() => {
  if (!model.value) return;
  if (!model.value.slotType) return 'Property';
  let propName = getPropertyName(model.value.slotType);
  return propName;
});

watch(activeCount, (val) => {
  if (!slotFillersReady.value) return;
  if (
    currentLimit.value < countAll.value
    && val < 25
  ) {
    loadMore();
  }
});

function loadMore() {
  if (currentLimit.value >= countAll.value) return;
  slotFillersSubHandle.setData('limit', currentLimit.value + 50);
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

function openLibraryBrowser() {
  dialogStackStore.pushDialogStack({
    component: 'library-browser-dialog',
    elementId: 'library-browser-button',
  });
}

function isDisabled(node) {
  return node._disabledByAlreadyAdded ||
    (
      node._disabledByQuantityFilled &&
      !selectedNodeIds.value.includes(node._id)
    );
}

function insertCustomFiller() {
  if (!model.value) return;
  const prop = getDefaultSlotFiller(model.value);
  const parentRef = { id: props.slotId, collection: 'creatureProperties' };
  const order = model.value.order + 0.5;
  
  dialogStackStore.pushDialogStack({
    component: 'insert-property-dialog',
    elementId: 'custom-button',
    data: {
      parentDoc: model.value,
      creatureId: props.creatureId,
      prop,
      noBackdropClose: true,
    },
    async callback(result) {
      if (!result) return;
      if (Array.isArray(result)){
        let nodeIds = result;
        await insertPropertyFromLibraryNode.callAsync({ nodeIds, parentRef, order });
        await dialogStackStore.popDialogStack();
      } else if (typeof result === 'object') {
        let creatureProperty = result;
        creatureProperty.order = order;
        await insertProperty.callAsync({ creatureProperty, parentRef });
        await dialogStackStore.popDialogStack();
      }
    }
  });
}
</script>

<style lang="css" scoped>
.disabled {
  opacity: 0.7;
}
</style>

