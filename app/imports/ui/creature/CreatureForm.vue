<template>
  <div class="creature-form">
    <text-field
      :label="$t('common.name')"
      :disabled="!editPermission"
      :model-value="model.name"
      @change="(value, ack) => emit('change', {path: ['name'], value, ack})"
    />
    <text-field
      :label="$t('creatureForm.alignment')"
      :disabled="!editPermission"
      :model-value="model.alignment"
      @change="(value, ack) => emit('change', {path: ['alignment'], value, ack})"
    />
    <text-field
      :label="$t('creatureForm.gender')"
      :disabled="!editPermission"
      :model-value="model.gender"
      @change="(value, ack) => emit('change', {path: ['gender'], value, ack})"
    />
    <v-row>
      <v-col
        cols="12"
        md="6"
      >
        <smart-image-input
          :label="$t('creatureForm.picture')"
          :hint="$t('creatureForm.pictureHint')"
          :disabled="!editPermission"
          :model-value="model.picture"
          @change="(value, ack) => emit('change', {path: ['picture'], value, ack})"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <smart-image-input
          :label="$t('creatureForm.avatar')"
          :hint="$t('creatureForm.avatarHint')"
          :disabled="!editPermission"
          :model-value="model.avatarPicture"
          @change="(value, ack) => emit('change', {path: ['avatarPicture'], value, ack})"
        />
      </v-col>
    </v-row>
    <form-sections>
      <form-section :name="$t('creatureForm.settings')">
        <v-switch
          :label="$t('creatureForm.hideRedundantStats')"
          :disabled="!editPermission"
          :model-value="model.settings.hideUnusedStats"
          @update:model-value="value => emit('change', {path: ['settings','hideUnusedStats'], value: !!value})"
        />
        <v-switch
          :label="$t('creatureForm.hideRestButtons')"
          :disabled="!editPermission"
          :model-value="model.settings.hideRestButtons"
          @update:model-value="value => emit('change', {path: ['settings','hideRestButtons'], value: !!value})"
        />
        <v-switch
          :label="$t('creatureForm.showSpellsTab')"
          :disabled="!editPermission"
          :model-value="!model.settings.hideSpellsTab"
          @update:model-value="changeHideSpellsTab"
        />
        <v-switch
          :label="$t('creatureForm.showTreeTab')"
          :disabled="!editPermission"
          :model-value="model.settings.showTreeTab"
          @update:model-value="changeShowTreeTab"
        />
        <text-field
          :label="$t('creatureForm.hitDiceMultiplier')"
          :hint="$t('creatureForm.hitDiceMultiplierHint')"
          placeholder="0.5"
          type="number"
          min="0"
          max="1"
          step="0.1"
          :disabled="!editPermission"
          :model-value="model.settings.hitDiceResetMultiplier"
          @change="(value, ack) => emit('change', {path: ['settings','hitDiceResetMultiplier'], value, ack})"
        />
      </form-section>
      <form-section :name="$t('creatureForm.discord')">
        <text-field
          :label="$t('creatureForm.discordWebhook')"
          :hint="$t('creatureForm.discordWebhookHint')"
          placeholder="https://discord.com/api/webhooks/<id>/<token>"
          :disabled="!editPermission"
          :model-value="model.settings.discordWebhook"
          data-id="creature-discord-webhook"
          @change="(value, ack) => emit('change', {path: ['settings','discordWebhook'], value, ack})"
        />
        <!-- The party's webhook too: its sessions apply, the game master's -->
        <p
          v-if="discordWebhookId && editPermission && partyWebhook"
          class="text-body-medium my-0"
          data-id="discord-party-session"
        >
          {{ $t('discord.partySessionApplies', { name: partyWebhook.name }) }}
        </p>
        <discord-session-controls
          v-else-if="discordWebhookId && editPermission"
          :session="discordSession"
          :busy="sessionBusy"
          @start="startSession"
          @end="endSession"
        />
      </form-section>
      <form-section :name="$t('creatureForm.libraries')">
        <smart-switch
          :label="$t('creatureForm.allUserLibraries')"
          :disabled="!editPermission"
          :model-value="allUserLibraries"
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
          class="text-error my-0"
        >
          {{ libraryWriteError }}
        </p>
      </form-section>
      <form-section :name="$t('creatureForm.debug')">
        <v-btn
          data-id="dependency-graph-button"
          variant="text"
          @click="showDependencyGraph"
        >
          <v-icon start>
            mdi-graph
          </v-icon>
          {{ $t('creatureForm.dependencyGraph') }}
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
import FormSection from '/imports/ui/properties/forms/shared/FormSection.vue';
import FormSections from '/imports/ui/properties/forms/shared/FormSections.vue';
import LibraryList from '/imports/ui/library/LibraryList.vue';
import LibraryCollections from '/imports/api/library/LibraryCollections';
import { changeAllowedLibraries, toggleAllUserLibraries } from '/imports/api/creature/creatures/methods/changeAllowedLibraries';

import SmartImageInput from '/imports/ui/components/global/SmartImageInput.vue';
import DiscordSessionControls from '/imports/ui/creature/discord/DiscordSessionControls.vue';
import {
  startCharacterSession, endCharacterSession, characterPartyWebhook,
} from '/imports/api/creature/creatures/methods/discordSessionMethods';
import { parseWebhookURL } from '/imports/api/creature/log/discord/webhookUrl';
import { sessionOf } from '/imports/api/creature/log/discord/discordSession';
import boardErrorText from '/imports/ui/creature/party/boardErrorText';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '/imports/ui/stores/app';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

const appStore = useAppStore();
const dialogStackStore = useDialogStackStore();

const props = defineProps({
  model: {
    type: Object,
    default: () => ({}),
  },
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

// The Discord session of its webhook (D3), if one is open: a session of
// another webhook is over
const { t } = useI18n();
const discordWebhookId = computed(() => parseWebhookURL(props.model.settings?.discordWebhook)?.id);
const discordSession = computed(() => sessionOf(props.model.discordSession, discordWebhookId.value));
// 'start' or 'end' while its method runs
const sessionBusy = ref(undefined);

// The party whose webhook is this one, which posts its rolls: asked of the
// server, which alone knows the party's webhook
const partyWebhook = ref(null);
watch([discordWebhookId, editPermission], async ([webhookId, canEdit]) => {
  partyWebhook.value = null;
  if (!webhookId || !canEdit) return;
  try {
    partyWebhook.value = await characterPartyWebhook.callAsync({ creatureId: props.model._id }) || null;
  } catch (error) {
    console.error(error);
  }
}, { immediate: true });

async function runSession(name, call) {
  sessionBusy.value = name;
  try {
    await call();
  } catch (error) {
    console.error(error);
    snackbar({ text: boardErrorText(error, t) });
  } finally {
    sessionBusy.value = undefined;
  }
}

function startSession() {
  runSession('start', async () => {
    const opened = await startCharacterSession.callAsync({
      creatureId: props.model._id,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (!opened) return;
    snackbar({
      text: opened.kind === 'forum'
        ? t('discord.sessionStartedForum', { name: opened.name })
        : t('discord.sessionStartedChannel'),
    });
  });
}

function endSession() {
  runSession('end', async () => {
    await endCharacterSession.callAsync({ creatureId: props.model._id });
    snackbar({ text: t('discord.sessionEnded') });
  });
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
