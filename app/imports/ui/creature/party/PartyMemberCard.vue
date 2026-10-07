<template>
  <v-card
    ref="cardElement"
    class="party-member-card fill-height d-flex flex-column"
    :class="{ 'party-member-card--turn': hasTurn, 'party-member-card--turn-start': turnStarted }"
    :data-id="`party-member-${creature._id}`"
    :data-monster="isMonster || undefined"
  >
    <v-card-item>
      <template #prepend>
        <v-avatar
          v-bind="creature.color ? userColorProps(creature.color) : { color: isMonster ? 'surface-variant' : 'primary-container' }"
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
      <v-card-subtitle
        v-if="subtitle"
        class="text-wrap"
        data-id="party-member-subtitle"
      >
        {{ subtitle }}
      </v-card-subtitle>
      <template #append>
        <!-- A monster's lore, from its bestiary entry: the game master's -->
        <v-menu
          v-if="lore"
          max-width="420"
        >
          <template #activator="{ props: menuProps }">
            <v-btn
              v-bind="menuProps"
              variant="text"
              icon
              size="small"
              :aria-label="$t('monsters.description', { name: creature.name })"
              data-id="party-monster-lore"
            >
              <v-icon>mdi-text-box-outline</v-icon>
            </v-btn>
          </template>
          <v-card>
            <v-card-text>
              <markdown-text :markdown="lore" />
            </v-card-text>
          </v-card>
        </v-menu>
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
        <!-- A monster that leaves the fight before the encounter ends -->
        <v-menu v-if="isMonster && isOwner">
          <template #activator="{ props: menuProps }">
            <v-btn
              v-bind="menuProps"
              variant="text"
              icon
              size="small"
              :aria-label="$t('monsters.menu', { name: creature.name })"
              data-id="party-monster-menu"
            >
              <v-icon>mdi-dots-vertical</v-icon>
            </v-btn>
          </template>
          <v-list>
            <v-list-item
              prepend-icon="mdi-delete-outline"
              :title="$t('monsters.remove', { name: creature.name })"
              :subtitle="$t('monsters.removeHint')"
              data-id="party-monster-remove"
              @click="removeMonster"
            />
          </v-list>
        </v-menu>
      </template>
    </v-card-item>

    <v-card-text class="d-flex flex-column ga-3 pt-0">
      <!-- The sheet's combat summary, compact (D1). Not a monster's for the
        players: they never get its stats, hit points least of all -->
      <combat-summary
        v-if="!isMonster || canEdit"
        :creature-id="creature._id"
        compact
      />

      <!-- Its buffs and conditions, with how long each lasts; its editors give it more (UX10) -->
      <div
        v-if="conditions.length || canEdit"
        class="d-flex flex-wrap align-center ga-1"
      >
        <v-menu
          v-for="condition in conditions"
          :key="condition._id"
          :disabled="!canEdit"
        >
          <template #activator="{ props: menuProps }">
            <!-- A button that opens its menu: on a span without a role, aria-expanded means nothing -->
            <v-chip
              v-bind="{ ...menuProps, ...userColorProps(condition.color) }"
              role="button"
              size="small"
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
            <!-- A rule above it as a border: a list may not hold an <hr> -->
            <v-list-item
              class="border-t mt-1"
              :title="$t('conditions.remove')"
              prepend-icon="mdi-close"
              :data-id="`party-condition-remove-${condition._id}`"
              @click="removeCondition(condition)"
            />
          </v-list>
        </v-menu>
        <condition-chips
          v-if="canEdit"
          layout="add"
          :creature-id="creature._id"
          :buffs="conditions"
        />
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
import { ref, computed, watch, provide, reactive } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import { useI18n } from 'vue-i18n';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import { buffRoundsLeft } from '/imports/api/creature/creatureFolders/buffDurations';
import setBuffDuration from '/imports/api/creature/creatureProperties/methods/setBuffDuration';
import softRemoveProperty from '/imports/api/creature/creatureProperties/methods/softRemoveProperty';
import ConditionChips from '/imports/ui/properties/components/buffs/ConditionChips.vue';
import CombatSummary from '/imports/ui/creature/character/CombatSummary.vue';
import MarkdownText from '/imports/ui/components/MarkdownText.vue';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import removeCreature from '/imports/api/creature/creatures/methods/removeCreature';
import { monsterTags } from '/imports/api/creature/creatureFolders/boardMonsters';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import userColorProps from '/imports/ui/utility/userColor';

/**
 * One character on a party board: who they are, the stats a table needs at
 * a glance, their hit points (damage and healing when the viewer can edit
 * the character) and their buffs and conditions. Live, as the sheet is.
 *
 * A game master's monster shows its game master all that, its bestiary
 * entry's type line, challenge rating and lore, and a way to remove it; the
 * players see its name, picture and conditions, which is all they receive.
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

// Their turn starts: the card pulses once and comes into view. Not when the
// board loads
const cardElement = ref(null);
const turnStarted = ref(false);
watch(() => props.hasTurn, hasTurn => {
  turnStarted.value = false;
  if (!hasTurn) return;
  requestAnimationFrame(() => { turnStarted.value = true; });
  // Below lg the turn bar sticks at the top of the board, Next with it
  cardElement.value?.$el?.scrollIntoView?.({
    block: 'nearest',
    behavior: document.documentElement.classList.contains('reduce-motion') ? 'auto' : 'smooth',
  });
});

const canEdit = autorun(() => hasEditPermission(props.creature, Meteor.user())).result;

// A player sees the other players' characters on the board, not their sheets
const userId = autorun(() => Meteor.userId()).result;
const isOwner = computed(() => props.creature.owner === userId.value);

const isMonster = computed(() => props.creature.type === 'monster');
// The bestiary entry it was copied from, which the board publishes to the game master
const monsterTemplate = autorun(() => isMonster.value && props.creature.templateId
  && LibraryNodes.findOne(props.creature.templateId, { fields: { description: 1, libraryTags: 1 } })).result;
const monsterInfo = computed(() => monsterTags(monsterTemplate.value?.libraryTags));
// "Small humanoid (goblinoid), neutral evil", then its lore
const descriptionLines = computed(() => (monsterTemplate.value?.description?.text || '').split('\n'));
const lore = computed(() => descriptionLines.value.slice(1).join('\n').trim());
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


const classText = autorun(() => activeProperties({ type: 'class' })
  .map(cls => cls.level ? `${cls.name} ${cls.level}` : cls.name)
  .join(' / ')).result;

// A monster's challenge rating and type line, from its bestiary entry
const subtitle = computed(() => {
  if (!isMonster.value) return classText.value;
  const cr = monsterInfo.value.cr && t('monsters.crValue', { cr: monsterInfo.value.cr });
  return [cr, descriptionLines.value[0]].filter(Boolean).join(' · ');
});

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

async function removeMonster() {
  try {
    await removeCreature.callAsync({ charId: props.creature._id });
    snackbar({ text: t('monsters.removed', { name: props.creature.name }) });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message });
  }
}

async function removeCondition(buff) {
  try {
    await softRemoveProperty.callAsync({ _id: buff._id });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message });
  }
}

async function setDuration(buff, rounds) {
  try {
    await setBuffDuration.callAsync({ _id: buff._id, rounds });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message });
  }
}
</script>

<style scoped>
.party-member-card {
  /* Clear of the turn bar that sticks at the top of the board below lg */
  scroll-margin-top: calc(var(--v-layout-top) + 72px);
  outline: 3px solid transparent;
  transition: outline-color var(--motion-duration-medium) var(--motion-easing-standard);
}

.party-member-card--turn {
  outline-color: rgb(var(--v-theme-primary));
}

.party-member-card--turn-start {
  animation: party-member-turn var(--motion-duration-long) var(--motion-easing-emphasized-decelerate);
}

.reduce-motion .party-member-card--turn-start {
  animation: none;
}

@keyframes party-member-turn {
  from {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-primary), 0.6);
  }
  to {
    box-shadow: 0 0 0 14px rgba(var(--v-theme-primary), 0);
  }
}
</style>
