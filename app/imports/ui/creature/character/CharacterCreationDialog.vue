<template>
  <dialog-base :color="color">
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('newCharacter.title') }}
      </v-toolbar-title>
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
            :title="$t('newCharacter.start')"
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
            <!--
              What the character starts from (UX3): a card per ruleset, the one
              in the interface's language chosen first. Choosing one the user
              is not subscribed to subscribes them
            -->
            <div
              :id="rulesetLabelId"
              class="text-title-small"
            >
              {{ $t('newCharacter.ruleset') }}
            </div>
            <p class="text-body-small text-medium-emphasis mt-1 mb-3">
              {{ $t('newCharacter.rulesetHint') }}
            </p>
            <div
              v-if="rulesetsLoading"
              class="d-flex justify-center pa-4"
            >
              <v-progress-circular
                indeterminate
                color="primary"
              />
            </div>
            <div
              v-else
              class="ruleset-grid mb-4"
              role="radiogroup"
              :aria-labelledby="rulesetLabelId"
              data-id="ruleset-choices"
            >
              <v-card
                v-for="option in rulesetOptions"
                :key="option.value"
                :variant="rulesetChoice === option.value ? 'tonal' : 'outlined'"
                :color="rulesetChoice === option.value ? 'primary' : undefined"
                role="radio"
                :aria-checked="rulesetChoice === option.value"
                :data-id="`ruleset-${option.value}`"
                @click="rulesetChoice = option.value"
                @keydown.space.prevent="rulesetChoice = option.value"
              >
                <v-card-item>
                  <template #prepend>
                    <v-icon>
                      {{ rulesetChoice === option.value ? 'mdi-radiobox-marked' : 'mdi-radiobox-blank' }}
                    </v-icon>
                  </template>
                  <v-card-title class="text-title-medium text-wrap">
                    {{ option.name }}
                  </v-card-title>
                  <v-card-subtitle
                    v-if="option.subtitle"
                    class="text-wrap"
                  >
                    {{ option.subtitle }}
                  </v-card-subtitle>
                </v-card-item>
                <v-card-text class="pt-0">
                  <p
                    v-if="option.summary"
                    class="text-body-small my-0 ruleset-summary"
                  >
                    {{ option.summary }}
                  </p>
                  <div
                    v-if="option.language || option.followed || option.recommended"
                    class="d-flex flex-wrap ga-1 mt-2"
                  >
                    <v-chip
                      v-if="option.recommended"
                      size="x-small"
                      variant="flat"
                      color="primary"
                      prepend-icon="mdi-star"
                    >
                      {{ $t('library.recommended') }}
                    </v-chip>
                    <v-chip
                      v-if="option.language"
                      size="x-small"
                      variant="outlined"
                    >
                      {{ $t(`newCharacter.language.${option.language}`) }}
                    </v-chip>
                    <v-chip
                      v-if="option.followed"
                      size="x-small"
                      variant="outlined"
                      prepend-icon="mdi-check"
                    >
                      {{ $t('newCharacter.followed') }}
                    </v-chip>
                  </div>
                </v-card-text>
              </v-card>
            </div>
            <v-text-field
              v-model.number="startingLevel"
              variant="outlined"
              :label="$t('newCharacter.level')"
              type="number"
              min="0"
            />
            <p class="text-body-small text-medium-emphasis mt-0">
              {{ $t('newCharacter.biographyLater') }}
            </p>
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
import { ref, computed, useId, onMounted } from 'vue';
import { Meteor } from 'meteor/meteor';
import { subscribe } from 'vue-meteor-tracker';
import listRulesets from '/imports/api/library/methods/listRulesets';
import { preferredRuleset } from '/imports/api/library/rulesets';

import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import { union, without } from 'lodash';
import DialogBase from '/imports/ui/dialogStack/DialogBase.vue';
import ColorPicker from '/imports/ui/components/ColorPicker.vue';
import insertCreature from '/imports/api/creature/creatures/methods/insertCreature';
import LibraryList from '/imports/ui/library/LibraryList.vue';
import LibraryCollections from '/imports/api/library/LibraryCollections';
import { useAppStore } from '/imports/ui/stores/app';
import { useI18n } from 'vue-i18n';

const { t, locale } = useI18n();

const appStore = useAppStore();

const emit = defineEmits(['pop']);

const step = ref(1);
const name = ref(t('newCharacter.defaultName'));
const color = ref(undefined);

// The rulesets on offer, and the chosen one's node id ('none': an empty sheet)
const rulesetLabelId = useId();
const rulesets = ref([]);
const rulesetsLoading = ref(true);
const rulesetChoice = ref('none');
const rulesetOptions = computed(() => [
  ...rulesets.value.map(ruleset => ({
    value: ruleset.nodeId,
    name: ruleset.name,
    subtitle: ruleset.rulesetName !== ruleset.name ? ruleset.rulesetName : undefined,
    summary: ruleset.summary,
    language: ruleset.language,
    followed: ruleset.followed,
    recommended: ruleset.recommended,
  })),
  { value: 'none', name: t('newCharacter.noRuleset'), summary: t('newCharacter.noRulesetHint') },
]);
const chosenRuleset = computed(() => rulesets.value.find(ruleset => ruleset.nodeId === rulesetChoice.value));

onMounted(async () => {
  try {
    rulesets.value = await listRulesets.callAsync() || [];
    rulesetChoice.value = preferredRuleset(rulesets.value, locale.value)?.nodeId || 'none';
  } catch (error) {
    console.error(error);
  } finally {
    rulesetsLoading.value = false;
  }
});

// Subscribes the user to the chosen ruleset's collection (or library), if needed
async function followRuleset(ruleset) {
  if (!ruleset || ruleset.followed) return;
  if (ruleset.collectionId) {
    await Meteor.users.subscribeToLibraryCollection.callAsync({
      libraryCollectionId: ruleset.collectionId, subscribe: true,
    });
  } else {
    await Meteor.users.subscribeToLibrary.callAsync({ libraryId: ruleset.libraryId, subscribe: true });
  }
}
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
  const ruleset = chosenRuleset.value;
  let char = {
    name: name.value,
    startingLevel: startingLevel.value,
    ...ruleset ? { rulesetId: ruleset.nodeId } : { withoutRuleset: true },
  };
  if (color.value) char.color = color.value;
  if (!allSubscribedLibraries.value) {
    // The chosen ruleset's libraries come with it
    char.allowedLibraries = ruleset && !ruleset.collectionId
      ? union(librariesSelected.value, [ruleset.libraryId])
      : librariesSelected.value;
    char.allowedLibraryCollections = ruleset?.collectionId
      ? union(libraryCollectionsSelected.value, [ruleset.collectionId])
      : libraryCollectionsSelected.value;
  }
  try {
    await followRuleset(ruleset);
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

<style scoped>
.ruleset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
  gap: 8px;
}

/* Two lines of a collection's description, at most */
.ruleset-summary {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
