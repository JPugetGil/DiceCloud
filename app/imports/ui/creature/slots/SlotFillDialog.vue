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
        :placeholder="$t('common.search')"
        clearable
        hide-details
        class="flex-grow-0"
        style="flex-basis: 300px;"
        :loading="searchLoading"
        @keyup.enter="applySearch.flush()"
        @click:clear="searchValue = undefined"
      />
      <!-- What the slot accepts, for library authors: kept out of the way -->
      <v-btn
        variant="text"
        icon
        :aria-label="slotFilterText"
      >
        <v-icon>mdi-information-outline</v-icon>
        <v-tooltip
          activator="parent"
          location="bottom"
          :text="slotFilterText"
        />
      </v-btn>
    </template>
    <property-description
      text
      :string="model?.description"
    />
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
        class="filler-list"
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
                <div class="d-flex flex-1-1 flex-column filler-text">
                  <div class="d-flex flex-1-1 align-center ga-2 filler-text">
                    <tree-node-view
                      :model="libraryNode"
                      class="flex-grow-0"
                    />
                    <div
                      v-if="libraryNode._disabledBySlotFillerCondition"
                      class="text-error text-body-small text-no-wrap text-truncate"
                    >
                      {{ libraryNode._conditionError }}
                    </div>
                    <v-spacer />
                    <div class="text-label-small text-medium-emphasis text-no-wrap text-truncate flex-shrink-1">
                      {{ libraryNames?.[libraryNode.root.id ] }}
                    </div>
                  </div>
                  <div
                    v-if="preview(libraryNode)"
                    class="text-body-small text-medium-emphasis text-truncate"
                  >
                    {{ preview(libraryNode) }}
                  </div>
                </div>
                <div
                  v-if="libraryNode.slotQuantityFilled !== undefined && libraryNode.slotQuantityFilled !== 1"
                  class="text-label-medium flex-grow-0 text-no-wrap"
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
        {{ $t('common.loadMore') }}
      </v-btn>
    </div>
    <template v-if="!showDisabled && disabledNodeCount">
      <div class="d-flex flex-1-1 flex-column align-center justify-center ma-3 mt-8">
        <div>
          {{ $t('slots.requirementsNotMet', { count: disabledNodeCount }, disabledNodeCount) }}
        </div>
        <v-btn
          class="mt-2"
          elevation="0"
          color="accent"
          variant="outlined"
          @click="showDisabled = true"
        >
          {{ $t('common.showAll') }}
        </v-btn>
      </div>
    </template>
    <div class="d-flex flex-1-1 align-center justify-center text-body-small text-disabled mt-8 mb-2">
      {{ $t('slots.cantFind') }}
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
        {{ $t('slots.browseCommunity') }}
      </v-btn>
      <v-btn
        v-if="!dummySlot"
        variant="text"
        size="small"
        :disabled="!model"
        data-id="custom-button"
        @click="insertCustomFiller"
      >
        {{ $t('slots.createCustom') }}
      </v-btn>
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
        variant="text"
        color="primary"
        :disabled="!dummySlot && !selectedNodeIds.length"
        @click="dialogStackStore.popDialogStack(selectedNodeIds)"
      >
        <span
          v-if="model?.spaceLeft"
          class="me-2"
        >
          {{ totalQuantitySelected }} / {{ model.spaceLeft }}
        </span>
        <template v-if="slotId">
          {{ $t('common.insert') }}
        </template>
        <template v-else>
          {{ $t('slots.closeTest') }}
        </template>
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup lang="js">
import { ref, computed, watch, provide, reactive } from 'vue';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { EJSON } from 'meteor/ejson';

import subscriptionData from '/imports/ui/utility/subscriptionData';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import DialogBase from '/imports/ui/dialogStack/DialogBase.vue';
import TreeNodeView from '/imports/ui/properties/treeNodeViews/TreeNodeView.vue';
import PropertyDescription from '/imports/ui/properties/viewers/shared/PropertyDescription.vue'
import evaluateSlotFillerConditions from '/imports/ui/creature/slots/slotFillerConditions';
import Libraries from '/imports/api/library/Libraries';
import LibraryNodeExpansionContent from '/imports/ui/library/LibraryNodeExpansionContent.vue';
import { getPropertyName } from '/imports/ui/i18n/propertyNames';
import { clone, difference, debounce } from 'lodash';
import firstSentence from '/imports/ui/utility/firstSentence';
import getDefaultSlotFiller from '/imports/api/library/methods/getDefaultSlotFiller';
import insertPropertyFromLibraryNode from '/imports/api/creature/creatureProperties/methods/insertPropertyFromLibraryNode';
import insertProperty from '/imports/api/creature/creatureProperties/methods/insertProperty';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

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
const autoSelectRan = ref(false);

provide('context', reactive({
  get creatureId() { return props.creatureId; }
}));

// Keep the object: its `sub` is a getter for the current Meteor handle, which
// changes when the arguments do. Destructured, it stayed the first handle, so
// a search read a stopped subscription's data (an empty list) and setData
// (load more, search terms) never reached the server
const slotFillersSubscription = subscribe(() => ['slotFillers', props.slotId || props.dummySlot?._id, searchValue.value || undefined, !!props.dummySlot]);
const slotFillersReady = slotFillersSubscription.ready;
subscribe(() => ['selectedFillers', props.slotId || props.dummySlot?._id, selectedNodeIds.value, !!props.dummySlot]);

const searchLoading = computed(() => !!searchValue.value && !slotFillersReady.value);

// Search as the player types, once they pause; Enter searches at once
const applySearch = debounce(() => {
  searchValue.value = (searchInput.value && searchInput.value.trim()) || undefined;
}, 350);
watch(searchInput, applySearch);

// A filler's first sentence, from its summary or else its description
const preview = node => firstSentence(node.summary?.text || node.description?.text);

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

// autorun, not computed: subscription data is read from minimongo, which only
// Tracker can react to
const currentLimit = autorun(() => subscriptionData(slotFillersSubscription.sub, 'limit') || 50).result;
const countAll = autorun(() => subscriptionData(slotFillersSubscription.sub, 'countAll')).result;

const libraryNodeFilter = autorun(() => {
  const filterString = subscriptionData(slotFillersSubscription.sub, 'libraryNodeFilter');
  if (!filterString) return;
  return EJSON.parse(filterString);
}).result;

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

// Library nodes that match the slot, flagged with what can be decided synchronously
const matchingNodes = autorun(() => {
  if (!libraryNodeFilter.value) return [];
  if (!slotFillersReady.value) return [];
  let nodes = LibraryNodes.find(libraryNodeFilter.value, {
    sort: { name: 1, order: 1 }
  }).fetch();
  nodes.forEach(node => {
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
  return nodes;
}).result;

// slotFillerCondition needs the async parser, so its verdicts arrive separately
const conditionErrors = ref(new Map());
const conditionsEvaluatedFor = ref(null);
watch([matchingNodes, variables], async () => {
  const nodes = matchingNodes.value;
  const errors = await evaluateSlotFillerConditions(nodes, variables.value);
  // A newer list may have arrived while this one was being evaluated
  if (nodes !== matchingNodes.value) return;
  conditionErrors.value = errors;
  conditionsEvaluatedFor.value = nodes;
}, { immediate: true });

const libraryNodes = computed(() => (matchingNodes.value || []).map(node => {
  const conditionError = conditionErrors.value.get(node._id);
  if (!conditionError) return node;
  return {
    ...node,
    _disabled: true,
    _disabledBySlotFillerCondition: true,
    _conditionError: conditionError,
  };
}));

const disabledNodeCount = computed(() => libraryNodes.value
  .filter(node => node._disabledBySlotFillerCondition).length);

// Select the only filler, once its condition is known to be met
watch(conditionsEvaluatedFor, (nodes) => {
  if (autoSelectRan.value || !nodes || nodes !== matchingNodes.value) return;
  if (!slotFillersReady.value || !libraryNodeFilter.value) return;
  autoSelectRan.value = true;
  const onlyNode = libraryNodes.value.length === 1 && libraryNodes.value[0];
  if (onlyNode && !onlyNode._disabled && !selectedNodeIds.value?.length) {
    selectedNodeIds.value = [onlyNode._id];
  }
});

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
  if (!model.value.slotType) return t('common.property');
  let propName = getPropertyName(model.value.slotType);
  return propName;
});

// "Property with library tags: race, LoV OR … NOT …", the slot's filter
const slotFilterText = computed(() => {
  const { or, not } = tagsSearched.value;
  return [
    t('slots.withLibraryTags', { type: slotPropertyTypeName.value }),
    or.map(tags => tags.join(', ')).join(` ${t('common.or')} `),
    ...not.map(tags => `${t('common.not')} ${tags.join(', ')}`),
  ].filter(Boolean).join(' ');
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
  slotFillersSubscription.sub?.setData('limit', currentLimit.value + 50);
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

/* Two lines per option: name and library, then a one-line preview */
.filler-list :deep(.v-expansion-panel-title) {
  min-height: 52px;
  padding-top: 6px;
  padding-bottom: 6px;
}

.filler-text {
  min-width: 0;
}
</style>

