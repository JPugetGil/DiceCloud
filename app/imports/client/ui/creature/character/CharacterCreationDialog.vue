<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        New Character
      </v-toolbar-title>
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
            title="Biography"
            :subtitle="biographyAlert || undefined"
          />
          <v-divider />
          <v-stepper-item
            editable
            :complete="step > 2"
            :value="2"
            title="Libraries"
          />
        </v-stepper-header>

        <v-stepper-window>
          <v-stepper-window-item :value="1">
            <v-text-field
              v-model="name"
              variant="outlined"
              label="Name"
              class="mt-1"
              :error="!name"
            />
            <v-text-field
              v-model="alignment"
              variant="outlined"
              label="Alignment"
            />
            <v-text-field
              v-model="gender"
              variant="outlined"
              label="Gender"
            />
            <v-text-field
              v-model.number="startingLevel"
              variant="outlined"
              label="Level"
              type="number"
              min="0"
              @keydown.tab="step++"
            />
          </v-stepper-window-item>
          <v-stepper-window-item :value="2">
            <v-switch
              v-model="allSubscribedLibraries"
              label="All user libraries"
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
        Cancel
      </v-btn>
      <v-btn
        v-if="step > 1"
        variant="text"
        @click="step--"
      >
        Back
      </v-btn>
      <v-spacer />
      <v-btn
        v-if="step < 2"
        color="accent"
        @click="step++"
      >
        Next
      </v-btn>
      <v-btn
        :disabled="!!biographyAlert"
        :loading="creating"
        :variant="step < 2 ? 'text' : 'elevated'"
        :color="step < 2? '' : 'accent'"
        @click="submit"
      >
        Create
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { subscribe } from 'vue-meteor-tracker';

import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import { defer, union, without } from 'lodash';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import insertCreature from '/imports/api/creature/creatures/methods/insertCreature';
import LibraryList from '/imports/client/ui/library/LibraryList.vue';
import LibraryCollections from '/imports/api/library/LibraryCollections';
import { useAppStore } from '/imports/client/ui/piniaAppStore';

const appStore = useAppStore();

const emit = defineEmits(['pop']);
const router = useRouter();

const step = ref(1);
const name = ref('New Character');
const gender = ref('');
const alignment = ref('');
const startingLevel = ref(1);
const librariesSelected = ref([]);
const libraryCollectionsSelected = ref([]);
const librariesSelectedByCollections = ref([]);
const allSubscribedLibraries = ref(true);
const creating = ref(false);

const biographyAlert = computed(() => {
  if (!name.value) return 'Name required';
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
  if (!allSubscribedLibraries.value) {
    char.allowedLibraries = librariesSelected.value;
    char.allowedLibraryCollections = libraryCollectionsSelected.value;
  }
  try {
    const creatureId = await insertCreature.callAsync(char);
    appStore.setTabForCharacterSheet({id: creatureId, tab: 'build'});
    emit('pop', creatureId);
    defer(() => {
      router.push({ name: 'characterSheet', params: {id: creatureId} });
    });
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

<style scoped>
.point-buy-table {
  width: 100%;
}
.point-buy-table td {
  text-align: center;
  padding: 0 8px 0 8px;
  max-width: 50px;
}
</style>
