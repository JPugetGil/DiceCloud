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
        <!-- The turn moves at once (the method's client simulation): a spinner only when the server is slow -->
        <v-btn
          variant="flat"
          color="primary"
          append-icon="mdi-chevron-right"
          data-id="initiative-next"
          :loading="slow === 'next'"
          @click="run('next', () => advanceInitiative.callAsync({ folderId: folder._id, step: 1 }))"
        >
          {{ $t('initiative.next') }}
        </v-btn>
      </template>
    </v-card-actions>

    <div
      v-if="order.length"
      ref="listElement"
      class="initiative-tracker__list"
    >
      <!-- One marker that slides from the turn that ended to the next -->
      <v-icon
        v-if="round && markerTop !== undefined"
        class="initiative-tracker__marker"
        :class="{ 'initiative-tracker__marker--placed': markerPlaced }"
        :style="{ transform: `translateY(${markerTop}px)` }"
        color="primary"
        aria-hidden="true"
        data-id="initiative-marker"
      >
        mdi-play
      </v-icon>
      <v-list
        density="compact"
        class="py-0"
      >
        <!-- Rows slide to their new place when the order changes, not when the turn does -->
        <transition-group name="initiative-row">
          <v-list-item
            v-for="(entry, index) in order"
            :key="entry._id"
            :active="!!round && index === turn"
            :aria-current="round && index === turn ? 'step' : undefined"
            color="primary"
            :class="{ 'initiative-tracker__row--out': entry.out }"
            :data-id="`initiative-entry-${entry._id}`"
          >
            <template #prepend>
              <span class="initiative-tracker__marker-space me-1" />
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
            <!--
              A creature added by hand (UX11): its status, hit points and armor
              class for the game master only, unless shown
            -->
            <div
              v-if="!entry.creatureId && (statusOf(entry) || statsOf(entry))"
              class="d-flex flex-wrap align-center gc-2 mt-1"
              :data-id="`initiative-creature-${entry._id}`"
            >
              <v-chip
                v-if="statusOf(entry)"
                size="x-small"
                variant="tonal"
                :color="STATUS_COLORS[statusOf(entry)]"
                :prepend-icon="STATUS_ICONS[statusOf(entry)]"
                :data-id="`initiative-status-${entry._id}`"
              >
                {{ $t(`initiative.status.${statusOf(entry)}`) }}
              </v-chip>
              <span
                v-if="statsOf(entry)?.hp"
                class="text-body-small text-tabular"
              >
                {{ $t('initiative.hitPoints', { value: hitPointsLeft(entry), total: statsOf(entry).hp }) }}
              </span>
              <span
                v-if="Number.isFinite(statsOf(entry)?.ac)"
                class="text-body-small"
              >
                {{ $t('initiative.armorClass', { ac: statsOf(entry).ac }) }}
              </span>
            </div>
            <template
              v-if="isGm && !entry.creatureId"
              #append
            >
              <v-menu
                v-if="statsOf(entry)?.hp"
                :model-value="healthMenu === entry._id"
                location="bottom end"
                :close-on-content-click="false"
                @update:model-value="open => healthMenu = open ? entry._id : null"
              >
                <template #activator="{ props: menuProps }">
                  <v-btn
                    v-bind="menuProps"
                    variant="text"
                    icon
                    size="small"
                    density="comfortable"
                    :aria-label="$t('initiative.changeHealth', { name: entry.name })"
                    :data-id="`initiative-health-${entry._id}`"
                  >
                    <v-icon>mdi-heart-half-full</v-icon>
                  </v-btn>
                </template>
                <health-change-menu
                  no-damage-type
                  :name="entry.name"
                  :value="hitPointsLeft(entry)"
                  :open="healthMenu === entry._id"
                  @change="change => changeHealth(entry, change)"
                  @close="healthMenu = null"
                />
              </v-menu>
              <v-btn
                variant="text"
                icon
                size="small"
                density="comfortable"
                :aria-label="$t('initiative.outOfFight', { name: entry.name })"
                :aria-pressed="!!entry.out"
                :color="entry.out ? 'error' : undefined"
                :data-id="`initiative-out-${entry._id}`"
                @click="run('out', () => setInitiativeEntryOut.callAsync({ folderId: folder._id, entryId: entry._id, out: !entry.out }))"
              >
                <v-icon>{{ entry.out ? 'mdi-skull' : 'mdi-skull-outline' }}</v-icon>
                <v-tooltip
                  activator="parent"
                  location="top"
                  :text="$t('initiative.outOfFight', { name: entry.name })"
                />
              </v-btn>
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
        </transition-group>
      </v-list>
    </div>
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
        <!-- Optional: how many (numbered rows), and the hit points and armor class only the game master sees -->
        <v-text-field
          v-model.number="newCount"
          :label="$t('initiative.count')"
          type="number"
          min="1"
          :max="MAX_COUNT"
          prefix="×"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 88px;"
          data-id="initiative-new-count"
        />
        <v-text-field
          v-model.number="newHp"
          :label="$t('initiative.hpLabel')"
          type="number"
          min="1"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 88px;"
          data-id="initiative-new-hp"
        />
        <v-text-field
          v-model.number="newAc"
          :label="$t('initiative.acLabel')"
          type="number"
          min="0"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 80px;"
          data-id="initiative-new-ac"
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

    <v-card-text
      v-if="isGm"
      class="pt-0"
    >
      <v-switch
        :model-value="folder.trackDurations !== false"
        :label="$t('combat.trackDurations')"
        :hint="$t('combat.trackDurationsHint')"
        persistent-hint
        color="primary"
        density="compact"
        :loading="busy === 'track'"
        data-id="initiative-track-durations"
        @update:model-value="value => run('track', () => setTrackDurations.callAsync({ folderId: folder._id, trackDurations: !!value }))"
      />
      <v-switch
        v-if="round"
        :model-value="!!folder.initiative?.showStats"
        :label="$t('initiative.showStats')"
        :hint="$t('initiative.showStatsHint')"
        persistent-hint
        color="primary"
        density="compact"
        class="mt-2"
        :loading="busy === 'showStats'"
        data-id="initiative-show-stats"
        @update:model-value="value => run('showStats', () => setInitiativeShowStats.callAsync({ folderId: folder._id, showStats: !!value }))"
      />
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
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { SLOW_MS } from '/imports/ui/utility/motion';
import { Meteor } from 'meteor/meteor';
import { autorun } from 'vue-meteor-tracker';
import initiativeOrder from '/imports/api/creature/creatureFolders/initiativeOrder';
import {
  rollInitiative, addInitiativeEntry, updateInitiativeEntry, removeInitiativeEntry,
  advanceInitiative, endInitiative, setTrackDurations,
  damageInitiativeEntry, setInitiativeEntryOut, setInitiativeShowStats,
} from '/imports/api/creature/creatureFolders/methods/initiativeMethods';
import { MAX_COUNT, entryStatus } from '/imports/api/creature/creatureFolders/initiativeCreatures';
import HealthChangeMenu from '/imports/ui/properties/components/attributes/HealthChangeMenu.vue';
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
// The action still running after SLOW_MS: only then a spinner, the client
// simulation has usually moved the turn already
const slow = ref(null);
const newName = ref('');
const newBonus = ref(0);
const newCount = ref(1);
const newHp = ref(undefined);
const newAc = ref(undefined);

// A creature's stats, which only the game master receives, unless shown
const statsOf = entry => props.folder.initiativeStats?.[entry._id];
const hitPointsLeft = entry => Math.max(0, (statsOf(entry)?.hp || 0) - (statsOf(entry)?.damage || 0));
// Unhurt, bloodied or down: it tells of the hit points, so the players see it with them alone
const statusOf = entry => (isGm.value || statsOf(entry)) ? entryStatus(statsOf(entry), entry.out) : undefined;
const STATUS_COLORS = { unhurt: 'success', bloodied: 'warning', down: 'error' };
const STATUS_ICONS = { unhurt: 'mdi-heart', bloodied: 'mdi-heart-half-full', down: 'mdi-heart-off' };

// The creature whose health menu is open
const healthMenu = ref(null);

function changeHealth(entry, { mode, value }) {
  healthMenu.value = null;
  const stats = statsOf(entry) || {};
  let amount = value;
  if (mode === 'healing') amount = -value;
  if (mode === 'set') amount = (stats.hp || 0) - value - (stats.damage || 0);
  if (!amount) return;
  run('health', () => damageInitiativeEntry.callAsync({ folderId: props.folder._id, entryId: entry._id, amount }));
}

const signed = value => numberToSignedString(value || 0);

// A character's current name, which may have changed since it rolled
function entryName(entry) {
  if (!entry.creatureId) return entry.name;
  return props.creatures.find(creature => creature._id === entry.creatureId)?.name || entry.name;
}

async function run(name, call) {
  busy.value = name;
  const slowTimer = setTimeout(() => { slow.value = name; }, SLOW_MS);
  try {
    await call();
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message || error.toString() });
  } finally {
    clearTimeout(slowTimer);
    busy.value = null;
    slow.value = null;
  }
}

// The turn's marker sits beside the row whose turn it is, and slides to the
// next one; it is placed without sliding the first time
const listElement = ref(null);
const markerTop = ref(undefined);
const markerPlaced = ref(false);
const MARKER_SIZE = 24;

function placeMarker() {
  const entry = round.value && order.value[turn.value];
  const row = entry && listElement.value?.querySelector(`[data-id="initiative-entry-${entry._id}"]`);
  if (!row) {
    markerTop.value = undefined;
    markerPlaced.value = false;
    return;
  }
  markerTop.value = row.offsetTop + (row.offsetHeight - MARKER_SIZE) / 2;
  if (!markerPlaced.value) requestAnimationFrame(() => { markerPlaced.value = true; });
}

watch(() => [round.value, turn.value, order.value.map(entry => entry._id).join()],
  () => nextTick(placeMarker), { flush: 'post' });
// Rows change height with the width (names wrapping)
let resizeObserver;
onMounted(() => {
  placeMarker();
  resizeObserver = new ResizeObserver(() => placeMarker());
  watch(listElement, (element, oldElement) => {
    if (oldElement) resizeObserver.unobserve(oldElement);
    if (element) resizeObserver.observe(element);
  }, { immediate: true });
});
onBeforeUnmount(() => resizeObserver?.disconnect());

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
  const whole = value => Number.isFinite(value) ? Math.floor(value) : undefined;
  const count = Math.min(MAX_COUNT, Math.max(1, whole(newCount.value) || 1));
  const hp = whole(newHp.value);
  const ac = whole(newAc.value);
  await run('add', () => addInitiativeEntry.callAsync({
    folderId: props.folder._id,
    name,
    bonus: Number.isFinite(newBonus.value) ? newBonus.value : 0,
    ...count > 1 && { count },
    ...hp > 0 && { hp },
    ...ac >= 0 && { ac },
  }));
  newName.value = '';
  newBonus.value = 0;
  newCount.value = 1;
  newHp.value = undefined;
  newAc.value = undefined;
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

.initiative-tracker__list {
  position: relative;
}

/* A creature out of the fight: its turns are skipped */
.initiative-tracker__row--out :deep(.v-list-item-title) {
  text-decoration: line-through;
  opacity: 0.68;
}

.text-tabular {
  font-variant-numeric: tabular-nums;
}

/* The turn's row is tinted with primary: its subtitle in primary too fell to 3:1 */
.initiative-tracker__list :deep(.v-list-item--active .v-list-item-subtitle) {
  color: rgb(var(--v-theme-on-surface));
}

.initiative-tracker__marker-space {
  display: inline-block;
  width: 24px;
  flex: 0 0 auto;
}

.initiative-tracker__marker {
  position: absolute;
  top: 0;
  /* The list item's start padding */
  left: 16px;
  z-index: 1;
  pointer-events: none;
}

.initiative-tracker__marker--placed {
  transition: transform var(--motion-duration-medium) var(--motion-easing-emphasized-decelerate);
}

.reduce-motion .initiative-tracker__marker--placed {
  transition: none;
}

.initiative-row-move {
  transition: transform var(--motion-duration-medium) var(--motion-easing-standard);
}

.initiative-row-enter-active {
  transition: opacity var(--motion-duration-medium) var(--motion-easing-standard);
}

.initiative-row-enter-from {
  opacity: 0;
}

.reduce-motion .initiative-row-move {
  transition: none;
}
</style>
