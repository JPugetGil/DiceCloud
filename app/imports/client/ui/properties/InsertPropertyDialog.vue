<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title class="mr-4">
        <template v-if="tab === 2">
          {{ $t('insert.new') }}
        </template>{{ typeName }}
      </v-toolbar-title>
      <v-spacer />
      <v-slide-x-reverse-transition hide-on-leave>
        <v-switch
          v-if="tab === 0"
          :model-value="showPropertyHelp"
          append-icon="mdi-help"
          hide-details
          flat
          @update:model-value="propertyHelpChanged"
        />
        <v-btn
          v-if="tab === 1"
          variant="text"
          icon
          data-id="help-button"
          @click="helpDialog"
        >
          <v-icon>mdi-help</v-icon>
        </v-btn>
        <text-field
          v-if="tab === 2"
          prepend-inner-icon="mdi-magnify"
          regular
          hide-details
          :value="searchValue"
          :debounce="400"
          @change="searchChanged"
        />
      </v-slide-x-reverse-transition>
    </template>
    <template #toolbar-extension>
      <v-tabs
        v-model="tab"
      >
        <v-tab :disabled="!!forcedType">
          {{ typeName || $t('insert.type') }}
        </v-tab>
        <v-tab :disabled="!type">
          {{ $t('insert.create') }}
        </v-tab>
        <v-tab
          v-if="!hideLibraryTab"
          :disabled="!type"
        >
          {{ $t('insert.library') }}
        </v-tab>
      </v-tabs>
    </template>
    <template #unwrapped-content>
      <v-window
        v-model="tab"
        class="fill-height overflow-y-auto"
      >
        <v-window-item :disabled="!!forcedType">
          <property-selector
            :no-library-only-props="!showLibraryOnlyProps"
            :parent-type="parentDoc && parentDoc.type"
            :current-type="type"
            @select="e => type = e"
          />
        </v-window-item>
        <v-window-item
          :disabled="!type"
          class="dialog-background"
          style="min-height: 100%;"
        >
          <v-card-text
            v-if="!$slots['unwrapped-content']"
            class="dialog-background"
          >
            <property-form
              v-if="type"
              class="creature-property-form"
              no-child-insert
              :model="model"
              :errors="errors"
              :collection="collection"
              @change="change"
              @push="push"
              @pull="pull"
            />
          </v-card-text>
        </v-window-item>
        <v-window-item
          v-if="!hideLibraryTab"
          :disabled="!type"
        >
          <v-expansion-panels
            variant="accordion"
            tile
            multiple
          >
            <v-expansion-panel
              v-for="libraryNode in libraryNodes"
              :key="libraryNode._id"
              :model="libraryNode"
              :data-id="libraryNode._id"
            >
              <v-expansion-panel-title>
                <template #default="{ open }">
                  <v-checkbox
                    v-model="selectedNodeIds"
                    class="my-0 py-0 mr-2 flex-grow-0"
                    hide-details
                    :value="libraryNode._id"
                    :disabled="!selectedNodeIds.includes(libraryNode._id) &&
                      selectedNodeIds.length >= 20"
                    @click.stop
                  />
                  <div class="d-flex flex-1-1 flex-column">
                    <tree-node-view :model="libraryNode" />
                    <div class="text-caption">
                      {{ libraryNames[libraryNode.ancestors[0].id ] }}
                    </div>
                  </div>
                  <template v-if="open">
                    <v-spacer />
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
                <library-node-expansion-content :model="libraryNode" />
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
          <div class="d-flex flex-1-1 justify-center">
            <v-fade-transition mode="out-in">
              <div
                v-if="currentLimit < countAll"
                class="d-flex flex-1-1 justify-center align-stretch"
              >
                <v-btn
                  v-if="currentLimit < countAll"
                  key="load-more-btn"
                  :loading="!searchLibraryNodesReady"
                  color="accent"
                  class="ma-4"
                  @click="loadMore"
                >
                  {{ $t('common.loadMore') }}
                </v-btn>
              </div>
            </v-fade-transition>
          </div>
        </v-window-item>
      </v-window>
    </template>
    <template #actions>
      <v-btn
        variant="text"
        @click="dialogStackStore.popDialogStack()"
      >
        {{ tab === 1 ? "Discard" : "Cancel" }}
      </v-btn>
      <v-spacer />
      <v-btn
        v-if="tab === 1"
        variant="text"
        color="primary"
        :disabled="!valid"
        @click="dialogStackStore.popDialogStack(model)"
      >
        {{ $t('insert.createLower') }}
      </v-btn>
      <v-btn
        v-else-if="tab === 2"
        variant="text"
        color="primary"
        :disabled="!selectedNodeIds.length"
        @click="dialogStackStore.popDialogStack(selectedNodeIds)"
      >
        <template v-if="selectedNodeIds.length >= 15">
          {{ selectedNodeIds.length }}/20
        </template>
        {{ $t('common.insert') }}
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref, shallowRef, computed, watch, onMounted, reactive, provide } from 'vue';
import { get, toPath } from 'lodash';
import { autorun, subscribe } from 'vue-meteor-tracker';

import subscriptionData from '/imports/client/ui/utility/subscriptionData';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import PROPERTIES from '/imports/constants/PROPERTIES';
import { getPropertyName } from '/imports/client/ui/i18n/propertyNames';
import TreeNodeView from '/imports/client/ui/properties/treeNodeViews/TreeNodeView.vue';
import LibraryNodeExpansionContent from '/imports/client/ui/library/LibraryNodeExpansionContent.vue';
import propertySchemasIndex from '/imports/api/properties/propertySchemasIndex';
import Libraries from '/imports/api/library/Libraries';
import PropertySelector from '/imports/client/ui/properties/shared/PropertySelector.vue';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import PropertyForm from '/imports/client/ui/properties/PropertyForm.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  creatureId: {
    type: String,
    default: undefined,
  },
  forcedType: {
    type: String,
    default: undefined,
  },
  suggestedTypes: {
    type: Array,
    default: undefined,
  },
  collection: {
    type: String,
    default: undefined,
  },
  suggestedType: {
    type: String,
    default: undefined,
  },
  parentDoc: {
    type: Object,
    default: undefined,
  },
  prop: {
    type: Object,
    default: undefined,
  },
  children: {
    type: Array,
    default: () => [],
  },
  hideLibraryTab: Boolean,
  showLibraryOnlyProps: Boolean,
});


// Provide Context
const debounceTime = ref(0);
const isLibraryForm = computed(() => props.collection === 'libraryNodes' || undefined);

provide('context', reactive({
  debounceTime,
  isLibraryForm,
}));

// State
const selectedNodeIds = ref([]);
const type = ref(props.forcedType || props.suggestedType || props.prop?.type || undefined);
const model = ref(props.prop || {
  type: type.value,
  children: [],
});
const searchValue = ref(undefined);
const selectedNode = ref(undefined);
const tab = ref(0);

const schema = shallowRef(null);
const validationContext = shallowRef(null);

// Computed Properties
const typeName = computed(() => getPropertyName(type.value) || t('common.property'));
const docsPath = computed(() => {
  const propDef = PROPERTIES[type.value];
  return propDef && propDef.docsPath;
});

const errors = computed(() => {
  if (!model.value) {
    throw new Error('model must be set');
  }
  if (!validationContext.value) return {};
  
  let cleanModel = validationContext.value.clean(model.value, {
    getAutoValues: false,
  });
  validationContext.value.validate(cleanModel);
  
  let errorsObj = {};
  validationContext.value.validationErrors().forEach(error => {
    errorsObj[error.name] = schema.value.messageForError(error);
  });
  
  return errorsObj;
});

// Derived rather than set from inside errors(): a computed that writes to a ref
// runs its side effect on every re-evaluation, including ones Vue discards
const valid = computed(() => !Object.keys(errors.value).length);

// Watchers
watch(type, (newType) => {
  changeType(newType);
});

watch(() => props.prop, (newProp) => {
  model.value = newProp;
});

// Meteor Subscriptions
const { ready: searchLibraryNodesReady, sub: searchLibraryNodesHandle } = subscribe(() => ['searchLibraryNodes', props.creatureId]);
// eslint-disable-next-line no-unused-vars
subscribe(() => ['selectedLibraryNodes', selectedNodeIds.value]);

// Meteor Autoruns
const showPropertyHelp = autorun(() => {
  let user = Meteor.user();
  return !(user?.preferences?.hidePropertySelectDialogHelp);
}).result;

const currentLimit = autorun(() => {
  return subscriptionData(searchLibraryNodesHandle, 'limit') || 32;
}).result;

const countAll = autorun(() => {
  return subscriptionData(searchLibraryNodesHandle, 'countAll');
}).result;

const libraryNodes = autorun(() => {
  return LibraryNodes.find({
    _searchResult: true
  }, {
    sort: {
      name: 1,
      type: 1,
      left: 1,
    },
  }).fetch();
}).result;

const libraryNames = autorun(() => {
  let names = {};
  Libraries.find().fetch().forEach(lib => names[lib._id] = lib.name);
  return names;
}).result;

// Methods
function changeType(newType) {
  searchLibraryNodesHandle.value?.setData('type', newType);
  if (!newType) return;
  tab.value = 1;
  schema.value = propertySchemasIndex[newType];
  validationContext.value = schema.value.newContext();
  let newModel = model.value || {};
  newModel = schema.value.clean(newModel);
  newModel.type = newType;
  model.value = newModel;
}

// Inlined from schemaFormMixin.js
function resolvePath(modelObj, path) {
  let arrayPath = toPath(path);
  if (arrayPath.length === 1) {
    return { object: modelObj, key: arrayPath[0] };
  }
  let key = arrayPath.slice(-1);
  let objectPath = arrayPath.slice(0, -1);
  let object = modelObj;
  
  objectPath.forEach(pathKey => {
    let newObject = object[pathKey];
    if (!newObject) {
      newObject = {};
      object[pathKey] = newObject;
    }
    object = newObject;
  });
  
  return { object, key };
}

function change({ path, value, ack }) {
  let { object, key } = resolvePath(model.value, path);
  object[key] = value;
  if (ack) ack();
}

function push({ path, value, ack }) {
  let array = get(model.value, path);
  if (array === undefined) {
    let { object, key } = resolvePath(model.value, path);
    object[key] = [value];
  } else if (!array.push) {
    throw `${path.join('.')} is ${array}, doesn't have "push"`;
  } else {
    array.push(value);
  }
  if (ack) ack();
}

function pull({ path, ack }) {
  let { object, key } = resolvePath(model.value, path);
  if (!object || !object.splice) {
    throw `${path.join('.')} is ${object}, doesnt have "splice"`;
  }
  object.splice(key, 1);
  if (ack) ack();
}

async function propertyHelpChanged(value) {
  try {
    await Meteor.users.setPreference.callAsync({
      preference: 'hidePropertySelectDialogHelp',
      value: !value
    });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason });
  }
}

function helpDialog() {
  dialogStackStore.pushDialogStack({
    component: 'help-dialog',
    elementId: 'help-button',
    data: {
      path: docsPath.value,
    },
  });
}

function searchChanged(val, ack) {
  searchLibraryNodesHandle.value?.setData('searchTerm', val);
  searchLibraryNodesHandle.value?.setData('limit', undefined);
  selectedNode.value = undefined;
  searchValue.value = val;
  setTimeout(ack, 200);
}

function loadMore() {
  if (currentLimit.value >= countAll.value) return;
  searchLibraryNodesHandle.value?.setData('limit', currentLimit.value + 32);
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

// Lifecycle
onMounted(() => {
  changeType(type.value);
});
</script>

<style lang="css" scoped>
.dialog-background {
  background-color: #fafafa;
}

.v-theme--dark .dialog-background {
  background-color: #303030;
}
</style>
