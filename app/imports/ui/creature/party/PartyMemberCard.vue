<template>
  <v-card
    class="party-member-card fill-height d-flex flex-column"
    :class="{ 'party-member-card--turn': hasTurn }"
    :data-id="`party-member-${creature._id}`"
  >
    <v-card-item>
      <template #prepend>
        <v-avatar
          :color="creature.color || 'primary-container'"
          variant="flat"
          size="44"
        >
          <v-img
            v-if="creature.avatarPicture || creature.picture"
            :src="creature.avatarPicture || creature.picture"
            cover
          />
          <span v-else>{{ (creature.name || '?')[0] }}</span>
        </v-avatar>
      </template>
      <v-card-title class="text-wrap">
        {{ creature.name }}
      </v-card-title>
      <v-card-subtitle v-if="classText">
        {{ classText }}
      </v-card-subtitle>
      <template #append>
        <v-btn
          v-if="canOpenSheet"
          variant="text"
          icon
          size="small"
          :to="`/character/${creature._id}`"
          :aria-label="$t('party.openSheet')"
        >
          <v-icon>mdi-open-in-app</v-icon>
          <v-tooltip
            activator="parent"
            location="top"
            :text="$t('party.openSheet')"
          />
        </v-btn>
      </template>
    </v-card-item>

    <v-card-text class="d-flex flex-column ga-3 pt-0">
      <div class="d-flex flex-wrap ga-2">
        <v-chip
          v-for="stat in stats"
          :key="stat.key"
          size="small"
          variant="tonal"
          :prepend-icon="stat.icon"
        >
          <span class="text-medium-emphasis me-1">{{ stat.label }}</span>
          <strong>{{ stat.value }}</strong>
        </v-chip>
      </div>

      <div v-if="hitPoints">
        <health-bar
          v-if="canEdit"
          :model="hitPoints"
          @change="({ type, value, ack }) => incrementChange(hitPoints, { type, value, ack })"
        />
        <div
          v-else
          class="d-flex align-center ga-2"
        >
          <span class="text-body-medium">{{ hitPoints.name }}</span>
          <health-bar-progress
            :model="hitPoints"
            class="flex-1-1"
          />
          <span class="text-body-medium">{{ hitPoints.value }} / {{ hitPoints.total }}</span>
        </div>
        <div
          v-if="tempHitPoints"
          class="text-body-small text-medium-emphasis mt-1"
        >
          {{ $t('party.tempHitPoints', { value: tempHitPoints.value }) }}
        </div>
      </div>

      <div
        v-if="conditions.length"
        class="d-flex flex-wrap ga-1"
      >
        <v-menu
          v-for="condition in conditions"
          :key="condition._id"
          :disabled="!canEdit"
        >
          <template #activator="{ props: menuProps }">
            <v-chip
              v-bind="menuProps"
              size="small"
              :color="condition.color || undefined"
              :variant="condition.color ? 'flat' : 'outlined'"
              :prepend-icon="roundsLeft(condition) === undefined ? 'mdi-alert-circle-outline' : 'mdi-timer-sand'"
              :data-id="`party-condition-${condition._id}`"
            >
              {{ condition.name }}
              <span
                v-if="roundsLeft(condition) !== undefined"
                class="ms-1 font-weight-bold"
                :title="$t('combat.roundsLeft', { count: roundsLeft(condition) }, roundsLeft(condition))"
              >
                · {{ roundsLeft(condition) }}
              </span>
            </v-chip>
          </template>
          <v-list
            density="compact"
            :data-id="`party-condition-menu-${condition._id}`"
          >
            <v-list-subheader>{{ $t('combat.lasts') }}</v-list-subheader>
            <v-list-item
              v-for="option in DURATION_OPTIONS"
              :key="option.rounds || 'none'"
              :title="durationTitle(option.rounds)"
              :active="(roundsLeft(condition) ?? null) === (option.rounds ?? null)"
              :data-id="`party-condition-duration-${option.rounds || 'none'}`"
              @click="setDuration(condition, option.rounds)"
            />
          </v-list>
        </v-menu>
      </div>
      <div
        v-else
        class="text-body-small text-medium-emphasis"
      >
        {{ $t('party.noConditions') }}
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { computed, provide, reactive } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import { useI18n } from 'vue-i18n';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import { buffRoundsLeft } from '/imports/api/creature/creatureFolders/buffDurations';
import setBuffDuration from '/imports/api/creature/creatureProperties/methods/setBuffDuration';
import numberToSignedString from '/imports/api/utility/numberToSignedString';
import HealthBar from '/imports/ui/properties/components/attributes/HealthBar.vue';
import HealthBarProgress from '/imports/ui/properties/components/attributes/HealthBarProgress.vue';
import doAction from '/imports/ui/creature/actions/doAction';
import getPropertyTitle from '/imports/ui/properties/shared/getPropertyTitle';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import useUnits from '/imports/ui/composables/useUnits';

/**
 * One character on a party board: who they are, the stats a table needs at
 * a glance, their hit points (damage and healing when the viewer can edit
 * the character) and their buffs and conditions. Live, as the sheet is.
 */
const props = defineProps({
  creature: {
    type: Object,
    required: true,
  },
  // Their turn in the initiative tracker
  hasTurn: Boolean,
});

const { t } = useI18n();
const { formatQuantity } = useUnits();

const canEdit = autorun(() => hasEditPermission(props.creature, Meteor.user())).result;

// A player sees the other players' characters on the board, not their sheets
const userId = autorun(() => Meteor.userId()).result;
const canOpenSheet = computed(() => canEdit.value || !!props.creature.public
  || [props.creature.owner, ...(props.creature.readers || [])].includes(userId.value));

// The cards and dialogs inside read the character from the context, as on its sheet
provide('context', reactive({
  get creatureId() { return props.creature._id; },
  get editPermission() { return canEdit.value; },
}));

const activeProperties = filter => CreatureProperties.find({
  'root.id': props.creature._id,
  removed: { $ne: true },
  inactive: { $ne: true },
  overridden: { $ne: true },
  ...filter,
}, { sort: { left: 1 } }).fetch();

const byVariable = autorun(() => {
  const found = {};
  activeProperties({ variableName: { $in: ['armor', 'speed', 'initiative', 'perception'] } })
    .forEach(prop => { found[prop.variableName] ??= prop; });
  return found;
}).result;

const healthBars = autorun(() => activeProperties({
  type: 'attribute', attributeType: 'healthBar',
})).result;

const hitPoints = computed(() => {
  const bars = healthBars.value || [];
  return bars.find(bar => bar.variableName === 'hitPoints') || bars[0];
});

const tempHitPoints = computed(() => (healthBars.value || []).find(bar =>
  /^temp(HP|HitPoints)$/i.test(bar.variableName || '') && bar.value > 0
));

const classText = autorun(() => activeProperties({ type: 'class' })
  .map(cls => cls.level ? `${cls.name} ${cls.level}` : cls.name)
  .join(' / ')).result;

const conditions = autorun(() => activeProperties({ type: 'buff' })).result;

// How long an effect lasts, counted down by the initiative tracker
const DURATION_OPTIONS = [
  { rounds: 1 }, { rounds: 2 }, { rounds: 3 }, { rounds: 10 }, { rounds: 100 }, { rounds: undefined },
];
const roundsLeft = buff => buffRoundsLeft(buff);

function durationTitle(rounds) {
  if (!rounds) return t('combat.untilRemoved');
  if (rounds % 10 === 0) {
    return t('combat.minutes', { count: rounds / 10, rounds }, rounds / 10);
  }
  return t('combat.rounds', { count: rounds }, rounds);
}

async function setDuration(buff, rounds) {
  try {
    await setBuffDuration.callAsync({ _id: buff._id, rounds });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message });
  }
}

const stats = computed(() => {
  const found = byVariable.value || {};
  const list = [];
  if (found.armor) {
    list.push({ key: 'armor', icon: 'mdi-shield-outline', label: t('party.armorClass'), value: found.armor.value });
  }
  if (found.initiative) {
    list.push({ key: 'initiative', icon: 'mdi-lightning-bolt-outline', label: t('party.initiative'),
      value: numberToSignedString(found.initiative.value ?? 0) });
  }
  if (found.perception) {
    list.push({ key: 'perception', icon: 'mdi-eye-outline', label: t('party.passivePerception'),
      value: 10 + (found.perception.value || 0) + (found.perception.passiveBonus || 0) });
  }
  if (found.speed) {
    list.push({ key: 'speed', icon: 'mdi-run', label: t('party.speed'),
      value: formatQuantity(found.speed.value, 'distance') });
  }
  return list;
});

// Damage and healing, as the Stats tab applies them
async function incrementChange(model, { type, value, ack }) {
  if (type === 'increment') value = -value;
  await doAction({
    creatureId: model.root.id,
    elementId: `party-member-${props.creature._id}`,
    task: {
      subtaskFn: 'damageProp',
      targetIds: [model.root.id],
      params: {
        title: getPropertyTitle(model),
        operation: type,
        value,
        targetProp: model,
      },
    },
  }).then(() => {
    ack?.();
  }).catch((error) => {
    if (ack) {
      ack(error);
    } else {
      snackbar({ text: error.reason || error.message || error.toString() });
      console.error(error);
    }
  });
}
</script>

<style scoped>
.party-member-card--turn {
  outline: 3px solid rgb(var(--v-theme-primary));
}
</style>
