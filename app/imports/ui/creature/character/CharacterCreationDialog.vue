<template>
  <dialog-base :color="color">
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('newCharacter.title') }}
      </v-toolbar-title>
      <v-spacer />
      <color-picker
        v-model="color"
        no-color-change
        :label="$t('newCharacter.color')"
      />
    </template>
    <template #unwrapped-content>
      <v-stepper
        v-model="step"
        flat
        non-linear
        hide-actions
      >
        <v-stepper-header>
          <v-stepper-item
            editable
            :complete="step > 1"
            :value="1"
            :rules="[() => biographyAlert || true]"
            :title="$t('newCharacter.biography')"
            :subtitle="biographyAlert || undefined"
          />
          <v-divider />
          <v-stepper-item
            editable
            :complete="step > 2"
            :value="2"
            :title="$t('creatureForm.libraries')"
          />
        </v-stepper-header>

        <v-stepper-window>
          <v-stepper-window-item :value="1">
            <v-text-field
              v-model="name"
              variant="outlined"
              :label="$t('common.name')"
              class="mt-1"
              :error="!name"
            />
            <v-text-field
              v-model="alignment"
              variant="outlined"
              :label="$t('creatureForm.alignment')"
            />
            <v-text-field
              v-model="gender"
              variant="outlined"
              :label="$t('creatureForm.gender')"
            />
            <v-text-field
              v-model.number="startingLevel"
              variant="outlined"
              :label="$t('newCharacter.level')"
              type="number"
              min="0"
            />
            <v-row density="compact">
              <v-col
                cols="12"
                md="6"
              >
                <smart-image-input
                  :label="$t('creatureForm.picture')"
                  :hint="$t('creatureForm.pictureHint')"
                  :model-value="picture"
                  @change="(value, ack) => { picture = value; ack(); }"
                />
              </v-col>
              <v-col
                cols="12"
                md="6"
              >
                <smart-image-input
                  :label="$t('creatureForm.avatar')"
                  :hint="$t('creatureForm.avatarHint')"
                  :model-value="avatarPicture"
                  @change="(value, ack) => { avatarPicture = value; ack(); }"
                />
              </v-col>
            </v-row>
          </v-stepper-window-item>
          <v-stepper-window-item :value="2">
            <v-switch
              v-model="allSubscribedLibraries"
              :label="$t('creatureForm.allUserLibraries')"
            />
            <library-list
              selection
              :disabled="allSubscribedLibraries"
              :libraries-selected="librariesSelected"
              :library-collections-selected="libraryCollectionsSelected"
              :libraries-selected-by-collections="librariesSelectedByCollections"
              @select-library="selectLibrary"
              @select-library-collection="selectLibraryCollection"
            />
          </v-stepper-window-item>
        </v-stepper-window>
      </v-stepper>
    </template>
    <template #actions>
      <v-btn
        variant="text"
        @click="$emit('pop')"
      >
        {{ $t('common.cancel') }}
      </v-btn>
      <v-btn
        v-if="step > 1"
        variant="text"
        @click="step--"
      >
        {{ $t('common.back') }}
      </v-btn>
      <v-spacer />
      <!-- Creating is the main action: the libraries step is optional -->
      <v-btn
        v-if="step < 2"
        variant="text"
        append-icon="mdi-chevron-right"
        @click="step++"
      >
        {{ $t('newCharacter.chooseLibraries') }}
      </v-btn>
      <v-btn
        :disabled="!!biographyAlert"
        :loading="creating"
        variant="flat"
        color="primary"
        @click="submit"
      >
        {{ $t('common.create') }}
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref, computed } from 'vue';
import { subscribe } from 'vue-meteor-tracker';

import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import { union, without } from 'lodash';
import DialogBase from '/imports/ui/dialogStack/DialogBase.vue';
import ColorPicker from '/imports/ui/components/ColorPicker.vue';
import SmartImageInput from '/imports/ui/components/global/SmartImageInput.vue';
import insertCreature from '/imports/api/creature/creatures/methods/insertCreature';
import LibraryList from '/imports/ui/library/LibraryList.vue';
import LibraryCollections from '/imports/api/library/LibraryCollections';
import { useAppStore } from '/imports/ui/stores/app';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const appStore = useAppStore();

const emit = defineEmits(['pop']);

const step = ref(1);
const name = ref(t('newCharacter.defaultName'));
const gender = ref('');
const alignment = ref('');
const picture = ref(undefined);
const avatarPicture = ref(undefined);
const color = ref(undefined);
const startingLevel = ref(1);
const librariesSelected = ref([]);
const libraryCollectionsSelected = ref([]);
const librariesSelectedByCollections = ref([]);
const allSubscribedLibraries = ref(true);
const creating = ref(false);

const biographyAlert = computed(() => {
  if (!name.value) return t('newCharacter.nameRequired');
  return undefined;
});

subscribe('libraries');

function selectLibrary(libraryId, val) {
  if (val) {
    librariesSelected.value = union(librariesSelected.value, [libraryId]);
  } else {
    librariesSelected.value = without(librariesSelected.value, libraryId);
  }
}

function selectLibraryCollection(libraryCollectionId, val) {
  const collection = LibraryCollections.findOne(libraryCollectionId);
  if (!collection) return;
  if (val) {
    libraryCollectionsSelected.value = union(
      libraryCollectionsSelected.value,
      [libraryCollectionId]
    );
    librariesSelectedByCollections.value = union(
      librariesSelectedByCollections.value,
      collection.libraries
    );
  } else {
    libraryCollectionsSelected.value = without(
      libraryCollectionsSelected.value,
      libraryCollectionId,
    );
    librariesSelectedByCollections.value = without(
      librariesSelectedByCollections.value,
      ...collection.libraries
    );
  }
}

async function submit(){
  creating.value = true;
  let char = {
    name: name.value,
    gender: gender.value,
    alignment: alignment.value,
    startingLevel: startingLevel.value,
  };
  if (picture.value) char.picture = picture.value;
  if (avatarPicture.value) char.avatarPicture = avatarPicture.value;
  if (color.value) char.color = color.value;
  if (!allSubscribedLibraries.value) {
    char.allowedLibraries = librariesSelected.value;
    char.allowedLibraryCollections = libraryCollectionsSelected.value;
  }
  try {
    const creatureId = await insertCreature.callAsync(char);
    appStore.setTabForCharacterSheet({id: creatureId, tab: 'build'});
    // The opener goes to the new sheet: closing a dialog steps back in the
    // browser's history, which undid a navigation started from here
    emit('pop', creatureId);
    return creatureId;
  } catch (error) {
    if (error) {
      console.error(error);
      snackbar({
        text: error.reason,
      });
    }
  } finally {
    creating.value = false;
  }
}
</script>
