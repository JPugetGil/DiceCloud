<template>
  <div
    class="bg-page"
    style="height: 100%"
  >
    <!-- Room under the last row for the floating button, which covered "Add folder" -->
    <v-container class="fab-clearance">
      <v-row
        class="justify-center"
      >
        <v-col
          cols="12"
          :xl="view === 'list' ? 8 : 10"
        >
          <div
            v-if="hasCharacters"
            class="d-flex flex-wrap align-center ga-3 mb-3"
          >
            <v-text-field
              v-model="search"
              prepend-inner-icon="mdi-magnify"
              :placeholder="$t('characterList.search')"
              :aria-label="$t('characterList.search')"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              class="flex-1-1"
              style="min-width: 220px;"
              data-id="character-list-search"
            />
            <v-btn-toggle
              v-model="sort"
              mandatory
              divided
              border
              rounded="pill"
              density="compact"
              color="primary"
              data-id="character-list-sort"
            >
              <v-btn
                value="name"
                prepend-icon="mdi-sort-alphabetical-ascending"
              >
                {{ $t('characterList.sortName') }}
              </v-btn>
              <v-btn
                value="level"
                prepend-icon="mdi-sort-numeric-descending"
              >
                {{ $t('characterList.sortLevel') }}
              </v-btn>
            </v-btn-toggle>
            <v-btn-toggle
              v-model="view"
              mandatory
              divided
              border
              rounded="pill"
              density="compact"
              color="primary"
              data-id="character-list-view"
            >
              <v-btn
                value="grid"
                :aria-label="$t('characterList.viewGrid')"
              >
                <v-icon>mdi-view-grid-outline</v-icon>
                <v-tooltip
                  activator="parent"
                  location="top"
                  :text="$t('characterList.viewGrid')"
                />
              </v-btn>
              <v-btn
                value="list"
                :aria-label="$t('characterList.viewList')"
              >
                <v-icon>mdi-view-list-outline</v-icon>
                <v-tooltip
                  activator="parent"
                  location="top"
                  :text="$t('characterList.viewList')"
                />
              </v-btn>
            </v-btn-toggle>
          </div>
          <v-card
            v-if="!hasCharacters && ready"
          >
            <!-- Without a library there is nothing to build a character from: say where they are -->
            <v-empty-state
              icon="mdi-account-plus-outline"
              :title="$t('characterList.emptyTitle')"
              :text="followsNoLibrary ? $t('characterList.emptyTextNoLibraries') : $t('characterList.emptyText')"
              data-id="character-list-empty"
            >
              <template
                v-if="followsNoLibrary"
                #actions
              >
                <v-btn
                  color="primary"
                  variant="flat"
                  prepend-icon="mdi-earth"
                  to="/community-libraries"
                >
                  {{ $t('library.browseCommunity') }}
                </v-btn>
              </template>
            </v-empty-state>
          </v-card>
          <v-card
            v-else-if="query && !shownCount"
          >
            <v-empty-state
              icon="mdi-magnify-close"
              :title="$t('characterList.noMatch', { search: search.trim() })"
            />
          </v-card>
          <v-card
            v-else-if="view === 'list'"
            :class="{ 'mb-4': shownFolders && shownFolders.length }"
          >
            <creature-folder-list
              :creatures="shownCreatures"
              :folders="shownFolders"
            />
          </v-card>
          <character-grid
            v-else
            :creatures="shownCreatures"
            :folders="shownFolders"
            :searching="!!query"
          />
          <div class="d-flex flex-wrap justify-end align-center ga-2 mt-3">
            <v-chip
              v-if="characterLimit !== Infinity"
              class="mr-auto"
              variant="tonal"
              prepend-icon="mdi-account-multiple-outline"
              data-id="character-count"
            >
              {{ $t('characterList.characterCount', { count: ownedCharacterCount, limit: characterLimit }) }}
            </v-chip>
            <v-btn
              v-if="showImportButton"
              variant="text"
              prepend-icon="mdi-file-import-outline"
              data-id="import-character-button"
              @click="importCharacter"
            >
              {{ $t('characterList.importCharacter') }}
            </v-btn>
            <v-btn
              variant="text"
              prepend-icon="mdi-folder-plus-outline"
              :loading="loadingInsertFolder"
              @click="insertFolder"
            >
              {{ $t('characterList.addFolder') }}
            </v-btn>
          </div>
          <v-btn
            color="primary"
            size="large"
            :icon="xs"
            :prepend-icon="xs ? undefined : 'mdi-plus'"
            rounded="lg"
            elevation="4"
            position="fixed"
            class="ma-4"
            location="bottom right"
            :aria-label="$t('characterList.newCharacter')"
            data-id="new-character-button"
            @click="insertCharacter"
          >
            <v-icon v-if="xs">
              mdi-plus
            </v-icon>
            <template v-else>
              {{ $t('characterList.newCharacter') }}
            </template>
          </v-btn>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script setup lang="js">
import { ref, computed, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { useRouter } from 'vue-router';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import insertCreatureFolder from '/imports/api/creature/creatureFolders/methods/insertCreatureFolder';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import CreatureFolderList from '/imports/ui/creature/creatureList/CreatureFolderList.vue';
import CharacterGrid from '/imports/ui/creature/creatureList/CharacterGrid.vue';
import getCreatureUrlName from '/imports/api/creature/creatures/getCreatureUrlName';
import { uniq, flatten } from 'lodash';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import useUserRole from '/imports/ui/composables/useUserRole';
import { ROLES } from '/imports/api/users/roles';
import { useI18n } from 'vue-i18n';

const dialogStackStore = useDialogStackStore();
const { t } = useI18n();
const { role, permissions } = useUserRole();


const characterTransform = function (char) {
  char.url = `/character/${char._id}/${getCreatureUrlName(char)}`;
  char.initial = char.name && char.name[0] || '?';
  return char;
};

const loadingInsertFolder = ref(false);

const { ready } = subscribe('characterList');
const { xs } = useDisplay();
const router = useRouter();

const { result: folders } = autorun(() => {
  const userId = Meteor.userId();
  let folders = CreatureFolders.find(
    { owner: userId, archived: { $ne: true } },
    { sort: { name: 1 } },
  ).map(folder => {
    folder.creatures = Creatures.find(
      {
        _id: { $in: folder.creatures || [] },
        $or: [{ readers: userId }, { writers: userId }, { owner: userId }],
      }, {
      sort: { name: 1 },
    }
    ).map(characterTransform);
    return folder;
  });
  return folders;
});

const { result: CreaturesWithNoParty } = autorun(() => {
  var userId = Meteor.userId();
  var charArrays = CreatureFolders.find({ owner: userId }).map(p => p.creatures);
  var folderChars = uniq(flatten(charArrays));
  return Creatures.find(
    {
      _id: { $nin: folderChars },
      $or: [{ readers: userId }, { writers: userId }, { owner: userId }],
    },
    { sort: { name: 1 } }
  ).map(characterTransform);
});

// Folders show even while empty: they are where characters are dropped
const followsNoLibrary = autorun(() => {
  const user = Meteor.user();
  return !!user && !user.subscribedLibraries?.length && !user.subscribedLibraryCollections?.length;
}).result;

const hasCharacters = computed(() =>
  !!(CreaturesWithNoParty.value?.length || folders.value?.length)
);

// How the list is shown and sorted, kept on this browser
function stored(key, fallback, allowed) {
  try {
    const value = localStorage.getItem(key);
    if (allowed.includes(value)) return value;
  } catch {
    // Storage blocked: the defaults
  }
  return fallback;
}
const view = ref(stored('characterListView', 'grid', ['grid', 'list']));
const sort = ref(stored('characterListSort', 'name', ['name', 'level']));
watch([view, sort], ([viewValue, sortValue]) => {
  try {
    localStorage.setItem('characterListView', viewValue);
    localStorage.setItem('characterListSort', sortValue);
  } catch {
    // Only this visit remembers them
  }
});

subscribe('characterListClasses');

// Each character's classes, in the order of its sheet
const { result: classesByCreature } = autorun(() => {
  const classes = {};
  CreatureProperties.find({
    type: 'class', removed: { $ne: true }, inactive: { $ne: true },
  }, {
    fields: { root: 1, name: 1, level: 1 },
    sort: { left: 1 },
  }).forEach(cls => (classes[cls.root.id] ||= []).push(cls));
  return classes;
});

function describe(character) {
  const classes = classesByCreature.value?.[character._id] || [];
  const level = classes.reduce((sum, cls) => sum + (cls.level || 0), 0);
  // A class's own level only tells something once there are several
  const names = classes
    .map(cls => classes.length > 1 && cls.level ? `${cls.name}\u00a0${cls.level}` : cls.name)
    .filter(Boolean).join(', ');
  let levelText = names || t('characterList.noClass');
  if (level) {
    levelText = names
      ? t('characterList.levelClasses', { level, classes: names })
      : t('characterList.level', { level });
  }
  return { ...character, level, levelText };
}

// Case and accents do not count: "elea" finds "Éléa"
const normalize = text => (text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const search = ref('');
const query = computed(() => normalize(search.value).trim());

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const byName = (a, b) => collator.compare(a.name || '', b.name || '');
const compare = (a, b) => sort.value === 'level' ? (b.level - a.level || byName(a, b)) : byName(a, b);

const arrange = creatures => (creatures || [])
  .map(describe)
  .filter(character => !query.value || normalize(`${character.name} ${character.levelText}`).includes(query.value))
  .sort(compare);
const shownCreatures = computed(() => arrange(CreaturesWithNoParty.value));
const shownFolders = computed(() => (folders.value || []).map(folder => ({
  ...folder,
  creatures: arrange(folder.creatures),
})));
const shownCount = computed(() => shownCreatures.value.length
  + shownFolders.value.reduce((count, folder) => count + folder.creatures.length, 0));

const { result: showImportButton } = autorun(() => {
  return !Meteor.settings.public?.disallowCreatureApiImport;
});

// The server enforces the role's character limit, this only explains it before
// the user fills in a new character
const characterLimit = computed(() => permissions.value.characterLimit);

// Player characters only, as the server counts them: a party board's monsters
// may be in minimongo too
const { result: ownedCharacterCount } = autorun(() => {
  return Creatures.find({ owner: Meteor.userId(), type: 'pc' }).count();
});

function checkCharacterLimit() {
  if (ownedCharacterCount.value < characterLimit.value) return true;
  // An active player is not offered the role they already have
  const message = role.value === ROLES.activePlayer
    ? 'characterList.limitReachedActivePlayer'
    : 'characterList.limitReached';
  snackbar({
    text: t(message, { limit: characterLimit.value }),
  });
  return false;
}

function insertCharacter() {
  if (!checkCharacterLimit()) return;
  dialogStackStore.pushDialogStack({
    component: 'character-creation-dialog',
    elementId: 'new-character-button',
    // Called once the dialog's history entry is gone: going to the new sheet
    // from the dialog itself was undone by that step back. After the browser's
    // own popstate handling, so that it is not undone either
    callback: creatureId => {
      if (creatureId) {
        setTimeout(() => router.push({ name: 'characterSheet', params: { id: creatureId } }));
      }
      return creatureId;
    },
  });
}

function importCharacter() {
  if (!checkCharacterLimit()) return;
  dialogStackStore.pushDialogStack({
    component: 'character-import-dialog',
    elementId: 'import-character-button',
    callback: creatureId => creatureId,
  });
}

async function insertFolder() {
  loadingInsertFolder.value = true;
  try {
    await insertCreatureFolder.callAsync();
  } catch (error) {
    console.error(error);
    snackbar({
      text: error.reason,
    });
  } finally {
    loadingInsertFolder.value = false;
  }
}
</script>
