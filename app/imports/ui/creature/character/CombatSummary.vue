<template>
  <v-card
    v-if="hasContent"
    class="combat-summary"
    :class="{ 'combat-summary--compact': compact, 'combat-summary--primary': part === 'primary' }"
    :data-id="`combat-summary-${part}`"
  >
    <div class="combat-summary__row">
      <!-- Hit points: the largest figure, the bar under it, nothing written inside -->
      <div
        v-if="showHitPoints && stats.hitPoints"
        class="combat-summary__hp"
      >
        <div class="d-flex align-center flex-wrap gc-2">
          <button
            type="button"
            class="combat-summary__name text-label-large text-medium-emphasis"
            :data-id="stats.hitPoints._id"
            @click="openProperty(stats.hitPoints._id)"
          >
            {{ stats.hitPoints.name }}
          </button>
          <v-chip
            v-if="stats.tempHitPoints?.value > 0"
            size="small"
            variant="tonal"
            prepend-icon="mdi-shield-plus-outline"
            data-id="combat-summary-temp-hp"
          >
            {{ $t('combat.tempHitPoints', { value: stats.tempHitPoints.value }) }}
          </v-chip>
        </div>
        <div
          class="combat-summary__hp-value"
          :class="{ 'combat-summary__hp-value--editable': canEdit }"
          :role="canEdit ? 'button' : undefined"
          :tabindex="canEdit ? 0 : undefined"
          :aria-label="canEdit
            ? $t('stats.changeHealth', { name: stats.hitPoints.name, value: stats.hitPoints.value, total: stats.hitPoints.total })
            : undefined"
          data-id="combat-summary-hp"
          @click="openMenu"
          @keydown.enter.prevent="openMenu"
          @keydown.space.prevent="openMenu"
        >
          <span :class="compact ? 'stat-value' : 'stat-value-lg'">{{ shownHitPoints }}</span>
          <span
            class="text-medium-emphasis"
            :class="compact ? 'text-title-medium' : 'text-title-large'"
          > / {{ stats.hitPoints.total }}</span>
          <health-delta
            :delta="delta"
            :change-key="changeKey"
            beside
          />
        </div>
        <div ref="barElement">
          <health-bar-progress
            :model="stats.hitPoints"
            :height="8"
            class="combat-summary__bar"
            :class="{ 'cursor-pointer': canEdit }"
            @click="openMenu"
          />
        </div>
        <v-menu
          v-if="canEdit"
          v-model="editing"
          location="bottom center"
          :offset="8"
          :target="barElement"
          :close-on-content-click="false"
        >
          <health-change-menu
            :name="stats.hitPoints.name"
            :value="stats.hitPoints.value"
            :open="editing"
            @change="changeHealth"
            @close="editing = false"
          />
        </v-menu>
      </div>

      <div
        v-if="tiles.length"
        class="combat-summary__stats"
      >
        <template
          v-for="tile in tiles"
          :key="tile.key"
        >
          <!-- Initiative rolls as a check, from a d20 tile -->
          <div
            v-if="tile.check"
            class="combat-stat combat-stat--check"
          >
            <check-button
              :model="tile.prop"
              shape="tile"
              :height="tileSize"
              :min-width="tileSize"
            >
              <value-change
                :class="valueClass"
                :value="tile.number"
                :change-key="`${tile.prop._id}.value`"
              >
                {{ tile.value }}
              </value-change>
            </check-button>
            <span class="combat-stat__label text-label-medium text-medium-emphasis">{{ tile.label }}</span>
          </div>
          <button
            v-else
            type="button"
            class="combat-stat"
            :data-id="tile.prop._id"
            @click="openProperty(tile.prop._id)"
          >
            <!-- Armor class on a shield, as on the printed sheet (D10) -->
            <span
              class="combat-stat__value"
              :class="[valueClass, { 'combat-stat__value--shield': tile.key === 'armor' }]"
              :style="{ minHeight: `${tileSize}px`, ...tile.key === 'armor' && { width: `${tileSize}px` } }"
            >
              <value-change
                :value="tile.number"
                :change-key="`${tile.prop._id}.${tile.key}`"
              >
                {{ tile.value }}
              </value-change>
            </span>
            <span class="combat-stat__label text-label-medium text-medium-emphasis">{{ tile.label }}</span>
          </button>
        </template>
      </div>
    </div>
  </v-card>
</template>

<script setup>
import { ref, computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import useCombatStats from '/imports/ui/composables/useCombatStats';
import useHealthChange from '/imports/ui/composables/useHealthChange';
import useTweenedNumber from '/imports/ui/composables/useTweenedNumber';
import useUnits from '/imports/ui/composables/useUnits';
import numberToSignedString from '/imports/api/utility/numberToSignedString';
import HealthBarProgress from '/imports/ui/properties/components/attributes/HealthBarProgress.vue';
import HealthDelta from '/imports/ui/properties/components/attributes/HealthDelta.vue';
import HealthChangeMenu from '/imports/ui/properties/components/attributes/HealthChangeMenu.vue';
import CheckButton from '/imports/ui/properties/shared/CheckButton.vue';
import ValueChange from '/imports/ui/components/ValueChange.vue';
import applyHealthChange from '/imports/ui/creature/actions/applyHealthChange';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

/**
 * The fight at a glance, at the head of the Stats tab (D1): hit points as the
 * largest figure, then armor class, initiative (a d20 tile that rolls it),
 * speed, proficiency bonus and passive Perception. Compact on the party
 * board's cards. `part` splits it on phones, where only the first row sticks
 * under the app bar: `primary` (hit points, armor class, initiative) and
 * `secondary` (the rest).
 */
const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
  part: {
    type: String,
    default: 'all',
    validator: value => ['all', 'primary', 'secondary'].includes(value),
  },
  compact: Boolean,
});

const { t } = useI18n();
const { formatQuantity } = useUnits();
const context = inject('context', {});
const dialogStackStore = useDialogStackStore();

const stats = useCombatStats(() => props.creatureId);
const canEdit = computed(() => context.editPermission !== false);

const PRIMARY = ['armor', 'initiative'];
const SHORT_LABELS = { initiative: 'party.initiative', passivePerception: 'party.passivePerception' };
const showHitPoints = computed(() => props.part !== 'secondary');
const tileSize = computed(() => props.compact ? 48 : 64);
const valueClass = computed(() => props.compact ? 'text-title-large' : 'stat-value');

const tiles = computed(() => {
  const s = stats.value;
  const list = [];
  // The party card's shorter labels when compact
  const label = key => t(props.compact && SHORT_LABELS[key] ? SHORT_LABELS[key] : `combat.${key}`);
  if (s.armor) list.push({ key: 'armor', prop: s.armor, label: label('armorClass'), value: s.armor.value, number: s.armor.value });
  if (s.initiative) {
    list.push({
      key: 'initiative', prop: s.initiative, label: label('initiative'),
      value: numberToSignedString(s.initiative.value ?? 0),
      number: s.initiative.value,
      // A roll from the sheet; on the party board, the tracker rolls it
      check: s.initiative.type === 'skill' && !props.compact,
    });
  }
  if (s.speed) {
    list.push({
      key: 'speed', prop: s.speed, label: label('speed'),
      value: formatQuantity(s.speed.value, 'distance'), number: s.speed.value,
    });
  }
  // Not on a party card, which shows what a game master checks
  if (s.proficiencyBonus && !props.compact) {
    list.push({
      key: 'proficiencyBonus', prop: s.proficiencyBonus, label: label('proficiency'),
      value: numberToSignedString(s.proficiencyBonus.value ?? 0),
      number: s.proficiencyBonus.value,
    });
  }
  if (s.perception) {
    list.push({
      key: 'perception', prop: s.perception, label: label('passivePerception'),
      value: s.passivePerception, number: s.passivePerception,
    });
  }
  if (props.part === 'primary') return list.filter(tile => PRIMARY.includes(tile.key));
  if (props.part === 'secondary') return list.filter(tile => !PRIMARY.includes(tile.key));
  return list;
});

const hasContent = computed(() => (showHitPoints.value && stats.value.hitPoints) || tiles.value.length);

// The ids it shows, which the Stats tab leaves out of its other cards
defineExpose({ stats });

const shownHitPoints = useTweenedNumber(() => stats.value.hitPoints?.value);
const { delta, changeKey } = useHealthChange(() => stats.value.hitPoints);

const editing = ref(false);
const barElement = ref(null);

function openMenu() {
  if (!canEdit.value) return;
  editing.value = true;
}

function changeHealth(change) {
  editing.value = false;
  applyHealthChange({ model: stats.value.hitPoints, elementId: 'combat-summary-hp', ...change }).catch(error => {
    snackbar({ text: error.reason || error.message || error.toString() });
    console.error(error);
  });
}

function openProperty(_id) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: _id,
    data: { _id },
  });
}
</script>

<style scoped>
.combat-summary__row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  column-gap: 24px;
  row-gap: 12px;
  padding: 12px 16px;
}

.combat-summary--compact .combat-summary__row {
  padding: 0;
  column-gap: 16px;
}

.combat-summary--compact {
  background: transparent;
  box-shadow: none;
}

.combat-summary__hp {
  flex: 1 1 220px;
  min-width: 0;
}

/* Sticking on a phone: hit points, armor class and initiative on one row */
.combat-summary--primary .combat-summary__row {
  flex-wrap: nowrap;
  column-gap: 12px;
  padding: 8px 12px;
}

.combat-summary--primary .combat-summary__hp {
  flex-basis: 120px;
}

.combat-summary__name {
  font: inherit;
  color: inherit;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}

.combat-summary__hp-value {
  position: relative;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  width: fit-content;
  border-radius: 8px;
}

.combat-summary__hp-value--editable {
  cursor: pointer;
}

.combat-summary__bar {
  margin-top: 4px;
  border-radius: 4px;
  overflow: hidden;
}

.combat-summary__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.combat-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 64px;
  padding: 0 4px;
  border: none;
  border-radius: 8px;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.combat-stat:not(.combat-stat--check):hover {
  background: rgba(var(--v-theme-on-surface), var(--v-hover-opacity));
}

.combat-stat__value {
  display: flex;
  align-items: center;
  font-variant-numeric: tabular-nums;
}

.combat-stat__label {
  white-space: nowrap;
}

/*
 * A heater shield: flat top with rounded shoulders, sides that curve in to a
 * point. Polygon points trace it; the number sits a little high, where the
 * shield is widest
 */
.combat-stat__value--shield {
  position: relative;
  isolation: isolate;
  justify-content: center;
  padding-bottom: 6px;
}

.combat-stat__value--shield::before {
  content: '';
  position: absolute;
  inset: 2px 4px;
  z-index: -1;
  background: rgba(var(--v-theme-primary), 0.14);
  clip-path: polygon(
    8% 6%, 30% 2%, 50% 0, 70% 2%, 92% 6%,
    100% 10%, 100% 40%, 96% 60%, 88% 76%, 74% 89%, 50% 100%,
    26% 89%, 12% 76%, 4% 60%, 0 40%, 0 10%
  );
}
</style>
