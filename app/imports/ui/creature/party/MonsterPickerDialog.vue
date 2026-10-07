<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('monsters.addTitle') }}
      </v-toolbar-title>
    </template>

    <div
      v-if="bestiaries === undefined"
      class="d-flex justify-center pa-8"
    >
      <v-progress-circular
        indeterminate
        color="primary"
        :aria-label="$t('monsters.loading')"
      />
    </div>
    <v-empty-state
      v-else-if="!bestiaries.length"
      icon="mdi-book-open-page-variant-outline"
      :title="$t('monsters.noBestiary')"
      :text="$t('monsters.noBestiaryText')"
      data-id="monster-no-bestiary"
    >
      <template #actions>
        <v-btn
          variant="tonal"
          to="/library"
          @click="dialogStackStore.popDialogStack()"
        >
          {{ $t('monsters.openLibrary') }}
        </v-btn>
      </template>
    </v-empty-state>

    <!-- 1. The monster: by name, challenge rating, size and type -->
    <div
      v-else-if="!selected"
      class="d-flex flex-column ga-3"
    >
      <v-text-field
        v-model="text"
        :label="$t('monsters.search')"
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="comfortable"
        clearable
        autofocus
        hide-details
        data-id="monster-search"
      />
      <div class="monster-picker__filters">
        <v-select
          v-if="bestiaries.length > 1"
          v-model="libraryIds"
          :items="bestiaries"
          item-title="name"
          item-value="_id"
          :label="$t('monsters.libraries')"
          multiple
          variant="outlined"
          density="compact"
          hide-details
          data-id="monster-libraries"
        />
        <v-select
          v-model="cr"
          :items="CHALLENGE_RATINGS"
          :label="$t('monsters.challengeRating')"
          variant="outlined"
          density="compact"
          clearable
          hide-details
          data-id="monster-cr"
        />
        <v-select
          v-model="size"
          :items="sizeItems"
          :label="$t('monsters.size')"
          variant="outlined"
          density="compact"
          clearable
          hide-details
          data-id="monster-size"
        />
        <v-select
          v-model="type"
          :items="typeItems"
          :label="$t('monsters.type')"
          variant="outlined"
          density="compact"
          clearable
          hide-details
          data-id="monster-type"
        />
      </div>
      <div
        class="text-body-small text-medium-emphasis"
        aria-live="polite"
        data-id="monster-results-count"
      >
        <template v-if="results">
          {{ results.total ? $t('monsters.results', { shown: results.monsters.length, total: results.total }) : $t('monsters.noResults') }}
        </template>
      </div>
      <v-list
        v-if="results?.monsters.length"
        lines="two"
        class="py-0"
        data-id="monster-results"
      >
        <v-list-item
          v-for="monster in results.monsters"
          :key="monster._id"
          :title="monster.name"
          :subtitle="monsterLine(monster)"
          :data-id="`monster-option-${monster._id}`"
          @click="selected = monster"
        >
          <template #prepend>
            <v-avatar
              color="surface-variant"
              variant="flat"
            >
              <v-img
                v-if="monster.picture"
                :src="monster.picture"
                cover
              />
              <span v-else>{{ (monster.name || '?')[0] }}</span>
            </v-avatar>
          </template>
          <template
            v-if="monster.cr"
            #append
          >
            <v-chip
              size="small"
              variant="tonal"
            >
              {{ $t('monsters.crValue', { cr: monster.cr }) }}
            </v-chip>
          </template>
        </v-list-item>
      </v-list>
      <div
        v-if="results && results.monsters.length < results.total"
        class="d-flex justify-center"
      >
        <v-btn
          variant="text"
          :loading="searching"
          data-id="monster-show-more"
          @click="limit += PAGE_SIZE"
        >
          {{ $t('monsters.showMore') }}
        </v-btn>
      </div>
    </div>

    <!-- 2. How many, and how -->
    <div
      v-else
      class="d-flex flex-column ga-4"
      data-id="monster-options"
    >
      <v-card
        variant="tonal"
        class="pa-3 d-flex align-center ga-3"
      >
        <v-avatar
          color="surface-variant"
          variant="flat"
          size="48"
        >
          <v-img
            v-if="selected.picture"
            :src="selected.picture"
            cover
          />
          <span v-else>{{ (selected.name || '?')[0] }}</span>
        </v-avatar>
        <div class="flex-1-1">
          <div class="text-title-medium">
            {{ selected.name }}
          </div>
          <div class="text-body-small text-medium-emphasis">
            {{ monsterLine(selected) }}
          </div>
        </div>
        <v-chip
          v-if="selected.cr"
          size="small"
          variant="tonal"
        >
          {{ $t('monsters.crValue', { cr: selected.cr }) }}
        </v-chip>
      </v-card>
      <div>
        <v-btn
          variant="text"
          prepend-icon="mdi-arrow-left"
          data-id="monster-choose-another"
          @click="selected = undefined"
        >
          {{ $t('monsters.chooseAnother') }}
        </v-btn>
      </div>

      <div>
        <v-text-field
          v-model.number="count"
          :label="$t('monsters.number')"
          type="number"
          min="1"
          :max="room"
          prefix="×"
          variant="outlined"
          density="comfortable"
          :disabled="!room"
          :hint="$t('monsters.roomLeft', { count: room }, room)"
          persistent-hint
          style="max-width: 280px;"
          data-id="monster-count"
        />
      </div>

      <div>
        <div class="text-label-large mb-2">
          {{ $t('monsters.hitPoints') }}
        </div>
        <v-btn-toggle
          v-model="hitPoints"
          mandatory
          variant="outlined"
          divided
          color="primary"
          density="comfortable"
          data-id="monster-hit-points"
        >
          <!-- A check on the chosen one, as Material's segmented buttons -->
          <v-btn
            value="average"
            :prepend-icon="hitPoints === 'average' ? 'mdi-check' : undefined"
            data-id="monster-hp-average"
          >
            {{ Number.isFinite(selected.hitPoints)
              ? $t('monsters.averageHitPointsValue', { value: selected.hitPoints })
              : $t('monsters.averageHitPoints') }}
          </v-btn>
          <v-btn
            value="rolled"
            :prepend-icon="hitPoints === 'rolled' ? 'mdi-check' : undefined"
            data-id="monster-hp-rolled"
          >
            {{ selected.hitDice
              ? $t('monsters.rolledHitPointsDice', { dice: selected.hitDice })
              : $t('monsters.rolledHitPoints') }}
          </v-btn>
        </v-btn-toggle>
        <p class="text-body-small text-medium-emphasis mt-2 mb-0">
          {{ $t('monsters.hitPointsHint') }}
        </p>
      </div>

      <div v-if="inFight">
        <p class="text-body-medium my-0">
          {{ $t('monsters.joinFight') }}
        </p>
        <v-switch
          v-if="wholeCount > 1"
          v-model="sharedInitiative"
          :label="$t('monsters.sharedInitiative')"
          color="primary"
          density="compact"
          hide-details
          data-id="monster-shared-initiative"
        />
      </div>
    </div>

    <template
      v-if="selected"
      #actions
    >
      <v-spacer />
      <v-btn
        variant="flat"
        color="primary"
        prepend-icon="mdi-plus"
        :loading="adding"
        :disabled="!canAdd"
        data-id="monster-add"
        @click="add"
      >
        {{ $t('monsters.addCount', { count: wholeCount }, wholeCount) }}
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import DialogBase from '/imports/ui/dialogStack/DialogBase.vue';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import {
  addBoardMonsters, listBestiaries, searchMonsters,
} from '/imports/api/creature/creatureFolders/methods/monsterMethods';
import {
  CHALLENGE_RATINGS, MAX_BOARD_MONSTERS, MONSTER_SIZES, MONSTER_TYPES,
} from '/imports/api/creature/creatureFolders/boardMonsters';
import boardErrorText from '/imports/ui/creature/party/boardErrorText';

/**
 * The game master picks a monster of their bestiaries (the libraries they
 * read that hold creature templates, those in the interface's language first)
 * and adds copies of it to the party board: how many, with average or rolled
 * hit points, and during a fight, with one initiative roll for the group.
 */
const props = defineProps({
  folderId: {
    type: String,
    required: true,
  },
  // The board's monsters already, which its cap counts
  monsterCount: {
    type: Number,
    default: 0,
  },
  // A fight is under way: the monsters join it
  inFight: Boolean,
});

const PAGE_SIZE = 50;

const { t, locale } = useI18n();
const dialogStackStore = useDialogStackStore();

const bestiaries = ref(undefined);
const libraryIds = ref([]);
const text = ref('');
const cr = ref(null);
const size = ref(null);
const type = ref(null);
const limit = ref(PAGE_SIZE);
const results = ref(undefined);
const searching = ref(false);

const selected = ref(undefined);
const count = ref(1);
const hitPoints = ref('average');
const sharedInitiative = ref(false);
const adding = ref(false);

const room = computed(() => Math.max(0, MAX_BOARD_MONSTERS - props.monsterCount));
const wholeCount = computed(() => Math.floor(Number(count.value)) || 0);
const canAdd = computed(() => wholeCount.value >= 1 && wholeCount.value <= room.value);

const sizeItems = computed(() => MONSTER_SIZES.map(value => ({ value, title: t(`monsters.sizes.${value}`) })));
const typeItems = computed(() => MONSTER_TYPES.map(value => ({ value, title: t(`monsters.types.${value}`) }))
  .sort((a, b) => a.title.localeCompare(b.title, locale.value)));

// "Small humanoid (goblinoid), neutral evil", else its size and type; and its
// bestiary when several are searched
function monsterLine(monster) {
  const line = monster.typeLine || [
    monster.size && t(`monsters.sizes.${monster.size}`),
    monster.type && t(`monsters.types.${monster.type}`),
  ].filter(Boolean).join(' · ');
  if (libraryIds.value.length < 2) return line;
  const library = bestiaries.value?.find(bestiary => bestiary._id === monster.libraryId);
  return [line, library?.name].filter(Boolean).join(' — ');
}

onMounted(async () => {
  try {
    bestiaries.value = await listBestiaries.callAsync();
  } catch (error) {
    console.error(error);
    snackbar({ text: boardErrorText(error, t) });
    bestiaries.value = [];
  }
  // Those in the interface's language, if there are any
  const local = bestiaries.value.filter(bestiary => bestiary.language === locale.value);
  libraryIds.value = (local.length ? local : bestiaries.value).map(bestiary => bestiary._id);
});

// The latest search wins: an older answer arriving late is dropped
let searchCount = 0;
let debounceTimer;
async function search() {
  const request = ++searchCount;
  searching.value = true;
  try {
    const found = await searchMonsters.callAsync({
      libraryIds: libraryIds.value,
      text: text.value || '',
      tags: [cr.value && `cr-${cr.value}`, size.value, type.value].filter(Boolean),
      limit: limit.value,
    });
    if (request === searchCount) results.value = found;
  } catch (error) {
    console.error(error);
    if (request === searchCount) snackbar({ text: boardErrorText(error, t) });
  } finally {
    if (request === searchCount) searching.value = false;
  }
}

// Typing waits for a pause; a filter searches at once, from the first page
watch(text, () => {
  clearTimeout(debounceTimer);
  limit.value = PAGE_SIZE;
  debounceTimer = setTimeout(search, 300);
});
watch([libraryIds, cr, size, type], () => {
  if (!libraryIds.value.length) {
    results.value = { total: 0, monsters: [] };
    return;
  }
  limit.value = PAGE_SIZE;
  search();
});
watch(limit, (value, old) => {
  if (value > old) search();
});
onBeforeUnmount(() => clearTimeout(debounceTimer));

async function add() {
  if (!canAdd.value) return;
  adding.value = true;
  const monster = selected.value;
  const added = wholeCount.value;
  try {
    await addBoardMonsters.callAsync({
      folderId: props.folderId,
      nodeId: monster._id,
      count: added,
      ...hitPoints.value === 'rolled' && { rollHitPoints: true },
      ...props.inFight && added > 1 && sharedInitiative.value && { sharedInitiative: true },
    });
    snackbar({ text: t('monsters.added', { name: monster.name, count: added }, added) });
    await dialogStackStore.popDialogStack();
  } catch (error) {
    console.error(error);
    snackbar({ text: boardErrorText(error, t) });
  } finally {
    adding.value = false;
  }
}
</script>

<style scoped>
.monster-picker__filters {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px;
}
</style>
