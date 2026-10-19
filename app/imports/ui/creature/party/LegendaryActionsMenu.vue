<template>
  <div
    v-if="resource"
    class="d-flex mt-1"
  >
    <v-menu
      v-model="open"
      location="bottom start"
      max-width="360"
    >
      <template #activator="{ props: menuProps }">
        <v-chip
          v-bind="menuProps"
          size="x-small"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-lightning-bolt"
          class="text-tabular"
          :aria-label="$t('legendary.badgeLabel', { name, value: left, total })"
          :data-id="`initiative-legendary-${entryId}`"
        >
          {{ $t('legendary.badge', { value: left, total }) }}
        </v-chip>
      </template>
      <v-list
        density="compact"
        :data-id="`initiative-legendary-menu-${entryId}`"
      >
        <v-list-subheader>
          {{ $t('legendary.title', { name }) }}
        </v-list-subheader>
        <!-- Taken at the end of another creature's turn: the game master's
          call, said, never enforced -->
        <v-list-item
          v-if="ownTurn"
          class="text-body-small text-medium-emphasis"
          prepend-icon="mdi-information-outline"
          :data-id="`initiative-legendary-own-turn-${entryId}`"
        >
          {{ $t('legendary.ownTurn', { name }) }}
        </v-list-item>
        <v-list-item
          v-for="option in options"
          :key="option._id"
          :title="option.name"
          :subtitle="$t('legendary.cost', { count: option.cost }, option.cost)"
          :disabled="!option.affordable || !!busy"
          :data-id="`initiative-legendary-option-${option._id}`"
          @click="use(option)"
        >
          <template
            v-if="busy === option._id"
            #append
          >
            <v-progress-circular
              indeterminate
              size="16"
              width="2"
            />
          </template>
        </v-list-item>
      </v-list>
    </v-menu>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue';
import { Meteor } from 'meteor/meteor';
import { autorun } from 'vue-meteor-tracker';
import { useI18n } from 'vue-i18n';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import doAction from '/imports/ui/creature/actions/doAction';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import boardErrorText from '/imports/ui/creature/party/boardErrorText';

/**
 * A creature's legendary actions in the game master's initiative tracker
 * (phase 3.2 of the monsters): how many it has left this round, "⚡ 2/3",
 * and its options with their cost, those it cannot pay greyed out. Choosing
 * one applies it as from the creature's sheet: its target picker, then its
 * dialog (doAction). They come back at the start of the creature's turn (a
 * reset of the turn events). The party board publishes them to the game
 * master alone (partyBoard.js); this renders nothing without them.
 */
const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
  entryId: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    default: '',
  },
  // Whether it is the creature's own turn: legendary actions are taken at the
  // end of another's, which the menu says
  ownTurn: Boolean,
  // The tracker's round: during a fight, the picker opens by itself
  round: {
    type: Number,
    default: 0,
  },
});

const { t } = useI18n();

const LEGENDARY_ACTIONS = 'legendaryActions';

const resource = autorun(() => CreatureProperties.findOne({
  'root.id': props.creatureId,
  type: 'attribute',
  variableName: LEGENDARY_ACTIONS,
  removed: { $ne: true },
  inactive: { $ne: true },
  overridden: { $ne: true },
})).result;
const left = computed(() => resource.value?.value ?? 0);
const total = computed(() => resource.value?.total ?? 0);

// The actions that spend them, in the sheet's order, with their cost
const options = autorun(() => CreatureProperties.find({
  'root.id': props.creatureId,
  type: 'action',
  'resources.attributesConsumed.variableName': LEGENDARY_ACTIONS,
  removed: { $ne: true },
  inactive: { $ne: true },
}, { sort: { left: 1 } }).map(action => {
  const consumed = action.resources.attributesConsumed.find(c => c.variableName === LEGENDARY_ACTIONS);
  const cost = Number.isFinite(consumed?.quantity?.value) ? consumed.quantity.value : 1;
  return {
    _id: action._id,
    name: action.name,
    cost,
    affordable: !action.insufficientResources && cost <= (resource.value?.value ?? 0),
  };
})).result;

const open = ref(false);
const busy = ref(null);

// The creature's whole sheet, which the action's simulation reads (the board
// has a few of its properties): subscribed once an option is chosen, kept
// while the tracker shows the menu, so that the target picker and the
// action's dialog never lose it under them
let sheet;
/** @returns {Promise<void>} */
function subscribeToSheet() {
  return new Promise((resolve, reject) => {
    if (sheet?.ready()) {
      resolve();
      return;
    }
    sheet = Meteor.subscribe('singleCharacter', props.creatureId, {
      onReady: () => resolve(),
      onStop: error => error && reject(error),
    });
  });
}
onBeforeUnmount(() => sheet?.stop());

async function use(option) {
  busy.value = option._id;
  try {
    await subscribeToSheet();
    open.value = false;
    await doAction({
      creatureId: props.creatureId,
      propId: option._id,
      elementId: `initiative-legendary-${props.entryId}`,
      // During a fight, as from the sheet: the picker by itself, preselected
      chooseTargets: props.round ? 'auto' : 'always',
    });
  } catch (error) {
    console.error(error);
    snackbar({ text: boardErrorText(error, t) });
  } finally {
    busy.value = null;
  }
}
</script>

<style scoped>
.text-tabular {
  font-variant-numeric: tabular-nums;
}
</style>
