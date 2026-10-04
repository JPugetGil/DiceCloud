<template>
  <v-card
    class="initiative-tracker"
    data-id="initiative-tracker"
  >
    <v-card-item>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon>mdi-sword-cross</v-icon>
        {{ $t('initiative.title') }}
        <v-chip
          v-if="round"
          size="small"
          color="primary"
          variant="tonal"
          data-id="initiative-round"
        >
          {{ $t('initiative.round', { round }) }}
        </v-chip>
      </v-card-title>
    </v-card-item>

    <v-card-actions
      v-if="isGm"
      class="flex-wrap ga-2 px-4"
    >
      <v-btn
        variant="tonal"
        color="primary"
        prepend-icon="mdi-dice-d20-outline"
        :loading="busy === 'roll'"
        data-id="initiative-roll"
        @click="run('roll', () => rollInitiative.callAsync({ folderId: folder._id }))"
      >
        {{ round ? $t('initiative.reroll') : $t('initiative.roll') }}
      </v-btn>
      <template v-if="round">
        <v-spacer />
        <v-btn
          variant="text"
          icon
          size="small"
          :aria-label="$t('initiative.previous')"
          data-id="initiative-previous"
          @click="run('previous', () => advanceInitiative.callAsync({ folderId: folder._id, step: -1 }))"
        >
          <v-icon>mdi-chevron-left</v-icon>
          <v-tooltip
            activator="parent"
            location="top"
            :text="$t('initiative.previous')"
          />
        </v-btn>
        <v-btn
          variant="flat"
          color="primary"
          append-icon="mdi-chevron-right"
          data-id="initiative-next"
          @click="run('next', () => advanceInitiative.callAsync({ folderId: folder._id, step: 1 }))"
        >
          {{ $t('initiative.next') }}
        </v-btn>
      </template>
    </v-card-actions>

    <v-list
      v-if="order.length"
      density="compact"
      class="py-0"
    >
      <v-list-item
        v-for="(entry, index) in order"
        :key="entry._id"
        :active="!!round && index === turn"
        color="primary"
        :data-id="`initiative-entry-${entry._id}`"
      >
        <template #prepend>
          <v-icon
            class="me-1"
            :style="{ visibility: round && index === turn ? 'visible' : 'hidden' }"
          >
            mdi-play
          </v-icon>
          <v-text-field
            v-if="canSetResult(entry)"
            :model-value="Number.isFinite(entry.initiative) ? entry.initiative : ''"
            type="number"
            variant="outlined"
            density="compact"
            hide-details
            class="initiative-tracker__value me-3"
            :aria-label="$t('initiative.result', { name: entryName(entry) })"
            :data-id="`initiative-result-${entry._id}`"
            @change="event => setResult(entry, event.target.value)"
          />
          <span
            v-else
            class="initiative-tracker__value initiative-tracker__value--readonly text-title-medium me-3"
            :data-id="`initiative-result-${entry._id}`"
          >
            {{ Number.isFinite(entry.initiative) ? entry.initiative : '–' }}
          </span>
        </template>
        <v-list-item-title>{{ entryName(entry) }}</v-list-item-title>
        <v-list-item-subtitle>
          <template v-if="Number.isFinite(entry.roll)">
            {{ $t('initiative.rollDetail', { roll: entry.roll, bonus: signed(entry.bonus) }) }}
          </template>
          <template v-else>
            {{ $t('initiative.bonus', { bonus: signed(entry.bonus) }) }}
          </template>
        </v-list-item-subtitle>
        <template
          v-if="isGm && !entry.creatureId"
          #append
        >
          <v-btn
            variant="text"
            icon
            size="small"
            :aria-label="$t('initiative.remove', { name: entry.name })"
            @click="run('remove', () => removeInitiativeEntry.callAsync({ folderId: folder._id, entryId: entry._id }))"
          >
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </template>
      </v-list-item>
    </v-list>
    <v-card-text
      v-else
      class="text-body-medium text-medium-emphasis"
    >
      {{ isGm ? $t('initiative.empty') : $t('initiative.emptyPlayer') }}
    </v-card-text>

    <v-divider v-if="isGm" />
    <v-card-text v-if="isGm">
      <div class="text-label-large mb-2">
        {{ $t('initiative.addTitle') }}
      </div>
      <form
        class="d-flex flex-wrap ga-2 align-center"
        @submit.prevent="addEntry"
      >
        <v-text-field
          v-model="newName"
          :label="$t('initiative.name')"
          variant="outlined"
          density="compact"
          hide-details
          class="flex-1-1"
          style="min-width: 140px;"
          data-id="initiative-new-name"
        />
        <v-text-field
          v-model.number="newBonus"
          :label="$t('initiative.bonusLabel')"
          type="number"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 96px;"
          data-id="initiative-new-bonus"
        />
        <v-btn
          type="submit"
          variant="tonal"
          prepend-icon="mdi-plus"
          :disabled="!newName.trim()"
          :loading="busy === 'add'"
          data-id="initiative-add"
        >
          {{ $t('initiative.add') }}
        </v-btn>
      </form>
    </v-card-text>

    <v-card-actions v-if="isGm && order.length">
      <v-spacer />
      <v-btn
        variant="text"
        prepend-icon="mdi-flag-checkered"
        data-id="initiative-end"
        @click="run('end', () => endInitiative.callAsync({ folderId: folder._id }))"
      >
        {{ $t('initiative.end') }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue';
import { Meteor } from 'meteor/meteor';
import { autorun } from 'vue-meteor-tracker';
import initiativeOrder from '/imports/api/creature/creatureFolders/initiativeOrder';
import {
  rollInitiative, addInitiativeEntry, updateInitiativeEntry, removeInitiativeEntry,
  advanceInitiative, endInitiative,
} from '/imports/api/creature/creatureFolders/methods/initiativeMethods';
import numberToSignedString from '/imports/api/utility/numberToSignedString';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';

/**
 * A party board's initiative tracker: the folder's characters roll d20 plus
 * their initiative (on the server), creatures are added by hand, results can
 * be typed in (a player's own roll), and the turn moves through the rounds.
 * Stored on the folder, so it follows the board live. The game master runs
 * it; the players follow it and type their own characters' results.
 */
const props = defineProps({
  folder: {
    type: Object,
    required: true,
  },
  creatures: {
    type: Array,
    default: () => [],
  },
  // 'gm' or 'member'
  role: {
    type: String,
    default: 'gm',
  },
});

const isGm = computed(() => props.role === 'gm');
const userId = autorun(() => Meteor.userId()).result;

function canSetResult(entry) {
  if (isGm.value) return true;
  if (!entry.creatureId) return false;
  return props.creatures.find(creature => creature._id === entry.creatureId)?.owner === userId.value;
}

const order = computed(() => initiativeOrder(props.folder.initiative?.entries || []));
const round = computed(() => props.folder.initiative?.round || 0);
const turn = computed(() => props.folder.initiative?.turn || 0);

const busy = ref(null);
const newName = ref('');
const newBonus = ref(0);

const signed = value => numberToSignedString(value || 0);

// A character's current name, which may have changed since it rolled
function entryName(entry) {
  if (!entry.creatureId) return entry.name;
  return props.creatures.find(creature => creature._id === entry.creatureId)?.name || entry.name;
}

async function run(name, call) {
  busy.value = name;
  try {
    await call();
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message || error.toString() });
  } finally {
    busy.value = null;
  }
}

function setResult(entry, value) {
  const initiative = Number(value);
  if (value === '' || !Number.isFinite(initiative)) return;
  run('update', () => updateInitiativeEntry.callAsync({
    folderId: props.folder._id, entryId: entry._id, initiative,
  }));
}

async function addEntry() {
  const name = newName.value.trim();
  if (!name) return;
  await run('add', () => addInitiativeEntry.callAsync({
    folderId: props.folder._id,
    name,
    bonus: Number.isFinite(newBonus.value) ? newBonus.value : 0,
  }));
  newName.value = '';
  newBonus.value = 0;
}
</script>

<style scoped>
.initiative-tracker__value {
  width: 72px;
  flex: 0 0 auto;
}

.initiative-tracker__value--readonly {
  text-align: center;
}
</style>
