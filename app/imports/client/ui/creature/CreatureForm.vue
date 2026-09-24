<template>
  <div class="creature-form">
    <text-field
      label="Name"
      :disabled="!editPermission"
      :value="model.name"
      :error-messages="errors.name"
      @change="(value, ack) => emit('change', {path: ['name'], value, ack})"
    />
    <text-field
      label="Alignment"
      :disabled="!editPermission"
      :value="model.alignment"
      :error-messages="errors.alignment"
      @change="(value, ack) => emit('change', {path: ['alignment'], value, ack})"
    />
    <text-field
      label="Gender"
      :disabled="!editPermission"
      :value="model.gender"
      :error-messages="errors.gender"
      @change="(value, ack) => emit('change', {path: ['gender'], value, ack})"
    />
    <v-row>
      <v-col
        cols="12"
        md="6"
      >
        <smart-image-input
          label="Picture"
          hint="A link to a high resolution image"
          :disabled="!editPermission"
          :value="model.picture"
          :error-messages="errors.picture"
          @change="(value, ack) => emit('change', {path: ['picture'], value, ack})"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <smart-image-input
          label="Avatar"
          hint="A link to a smaller, square image to use as an avatar"
          :disabled="!editPermission"
          :value="model.avatarPicture"
          :error-messages="errors.avatarPicture"
          @change="(value, ack) => emit('change', {path: ['avatarPicture'], value, ack})"
        />
      </v-col>
    </v-row>
    <form-sections>
      <form-section name="Settings">
        <v-switch
          label="Hide redundant stats"
          :disabled="!editPermission"
          :model-value="model.settings.hideUnusedStats"
          @update:model-value="value => emit('change', {path: ['settings','hideUnusedStats'], value: !!value})"
        />
        <v-switch
          label="Hide rest buttons"
          :disabled="!editPermission"
          :model-value="model.settings.hideRestButtons"
          @update:model-value="value => emit('change', {path: ['settings','hideRestButtons'], value: !!value})"
        />
        <v-switch
          label="Show spells tab"
          :disabled="!editPermission"
          :model-value="!model.settings.hideSpellsTab"
          @update:model-value="changeHideSpellsTab"
        />
        <v-switch
          label="Show tree tab"
          :disabled="!editPermission"
          :model-value="model.settings.showTreeTab"
          @update:model-value="changeShowTreeTab"
        />
        <text-field
          label="Hit Dice reset multiplier"
          hint="What fraction of your hit dice are reset every long rest"
          placeholder="0.5"
          type="number"
          min="0"
          max="1"
          step="0.1"
          :disabled="!editPermission"
          :value="model.settings.hitDiceResetMultiplier"
          @change="(value, ack) => emit('change', {path: ['settings','hitDiceResetMultiplier'], value, ack})"
        />
        <text-field
          label="Discord Webhook URL"
          hint="This creature's logs will be posted to the discord channel"
          placeholder="https://discordapp.com/api/webhooks/<id>/<token>"
          :disabled="!editPermission"
          :value="model.settings.discordWebhook"
          @change="(value, ack) => emit('change', {path: ['settings','discordWebhook'], value, ack})"
        />
        <!--
        <v-switch
          label="Use variant encumbrance"
          :input-value="model.settings.useVariantEncumbrance"
          :error-messages="errors.useVariantEncumbrance"
          @change="value => emit('change', {path: ['settings','useVariantEncumbrance'], value})"
        />
        <v-switch
          label="Hide spells tab"
          :input-value="model.settings.hideSpellcasting"
          :error-messages="errors.hideSpellcasting"
          @change="value => emit('change', {path: ['settings','hideSpellcasting'], value})"
        />
        <v-switch
          label="Swap ability scores and modifiers"
          :input-value="model.settings.swapStatAndModifier"
          :error-messages="errors.swapStatAndModifier"
          @change="value => emit('change', {path: ['settings','swapStatAndModifier'], value})"
        />
        -->
      </form-section>
      <form-section name="Libraries">
        <smart-switch
          label="All user libraries"
          :disabled="!editPermission"
          :value="allUserLibraries"
          @change="allUserLibrariesChange"
        />
        <library-list
          selection
          :disabled="!editPermission || (!model.allowedLibraries && !model.allowedLibraryCollections)"
          :libraries-selected="model.allowedLibraries"
          :library-collections-selected="model.allowedLibraryCollections"
          :libraries-selected-by-collections="librariesSelectedByCollections"
          @select-library="selectLibrary"
          @select-library-collection="selectLibraryCollection"
        />
        <v-progress-linear
          v-if="libraryWriteLoading"
          style="margin: 12px -24px -16px -24px; width: calc(100% + 48px);"
          indeterminate
        />
        <p
          v-if="libraryWriteError"
          class="text--error"
        >
          {{ libraryWriteError }}
        </p>
      </form-section>
      <form-section name="Debug">
        <v-btn
          data-id="dependency-graph-button"
          variant="text"
          @click="showDependencyGraph"
        >
          <v-icon start>
            mdi-graph
          </v-icon>
          Dependency Graph
        </v-btn>
      </form-section>
    </form-sections>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import { union, without, debounce } from 'lodash';
import FormSection from '/imports/client/ui/properties/forms/shared/FormSection.vue';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';
import LibraryList from '/imports/client/ui/library/LibraryList.vue';
import LibraryCollections from '/imports/api/library/LibraryCollections';
import { changeAllowedLibraries, toggleAllUserLibraries } from '/imports/api/creature/creatures/methods/changeAllowedLibraries';

import SmartImageInput from '/imports/client/ui/components/global/SmartImageInput.vue';
import { useAppStore } from '/imports/client/ui/piniaAppStore';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const appStore = useAppStore();
const dialogStackStore = useDialogStackStore();

const props = defineProps({
  stored: {
    type: Boolean,
  },
  model: {
    type: Object,
    default: () => ({}),
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
  attackForm: {
    type: Boolean,
  },
  disabled: Boolean,
});

const emit = defineEmits(['change']);


const libraryCollections = ref(props.model.allowedLibraryCollections);
const libraries = ref(props.model.allowedLibraries);
const libraryWriteLoading = ref(false);
const libraryWriteError = ref(undefined);
const dirty = ref(false); // If there are pending changes

const allUserLibraries = computed(() => {
  return !props.model.allowedLibraries && !props.model.allowedLibraryCollections;
});

watch(() => props.model.allowedLibraryCollections, (newVal) => {
  if (!dirty.value) libraryCollections.value = newVal;
});

watch(() => props.model.allowedLibraries, (newVal) => {
  if (!dirty.value) libraries.value = newVal;
});

const updateAllowedLibraryCollections = debounce(async () => {
  libraryWriteLoading.value = true;
  dirty.value = false;
  try {
    await changeAllowedLibraries.callAsync({
      _id: props.model._id,
      allowedLibraryCollections: libraryCollections.value,
    });
    libraryWriteError.value = undefined;
  } catch (error) {
    libraryWriteError.value = error;
  } finally {
    libraryWriteLoading.value = false;
  }
}, 500);

const updateAllowedLibraries = debounce(async () => {
  libraryWriteLoading.value = true;
  dirty.value = false;
  try {
    await changeAllowedLibraries.callAsync({
      _id: props.model._id,
      allowedLibraries: libraries.value,
    });
    libraryWriteError.value = undefined;
  } catch (error) {
    libraryWriteError.value = error;
  } finally {
    libraryWriteLoading.value = false;
  }
}, 500);

subscribe('libraries');

const librariesSelectedByCollections = autorun(() => {
  let ids = [];
  if (!props.model.allowedLibraryCollections) return ids;
  LibraryCollections.find({
    _id: { $in: props.model.allowedLibraryCollections }
  }).forEach(collection => {
    ids = union(ids, collection.libraries);
  });
  return ids;
}).result;

const editPermission = autorun(() => {
  return hasEditPermission(props.model, Meteor.user());
}).result;

function changeShowTreeTab(value) {
  let currentTab = appStore.tabNameById(props.model._id);
  if (!value && currentTab === 'tree') {
    appStore.setTabForCharacterSheet({ id: props.model._id, tab: 'build' });
  }
  emit('change', {
    path: ['settings', 'showTreeTab'],
    value: !!value
  });
}

function changeHideSpellsTab(value) {
  let currentTab = appStore.tabNameById(props.model._id);
  if (!value && currentTab === 'spells') {
    appStore.setTabForCharacterSheet({ id: props.model._id, tab: 'actions' });
  }
  emit('change', {
    path: ['settings', 'hideSpellsTab'],
    value: !value
  });
}

async function allUserLibrariesChange(value, ack) {
  try {
    await toggleAllUserLibraries.callAsync({
      _id: props.model._id,
      value,
    });
    ack();
  } catch (error) {
    ack(error);
  }
}

function selectLibrary(id, val) {
  if (val) {
    libraries.value = union(libraries.value, [id]);
  } else {
    libraries.value = without(libraries.value, id);
  }
  dirty.value = true;
  updateAllowedLibraries();
}

function selectLibraryCollection(id, val) {
  if (val) {
    libraryCollections.value = union(libraryCollections.value, [id]);
  } else {
    libraryCollections.value = without(libraryCollections.value, id);
  }
  dirty.value = true;
  updateAllowedLibraryCollections();
}

function showDependencyGraph() {
  dialogStackStore.pushDialogStack({
    component: 'dependency-graph-dialog',
    elementId: 'dependency-graph-button',
    data: {
      creatureId: props.model._id,
    },
  });
}
</script>

<style lang="css" scoped>

</style>
