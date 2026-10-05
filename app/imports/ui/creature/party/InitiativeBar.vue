<template>
  <v-card
    class="initiative-bar d-flex align-center flex-wrap gc-3 gr-1 px-4 py-2"
    data-id="initiative-bar"
    elevation="4"
  >
    <v-icon size="small">
      mdi-sword-cross
    </v-icon>
    <span class="text-title-small">{{ $t('combat.round', { round }) }}</span>
    <span
      class="text-body-medium flex-1-1"
      style="min-width: 0;"
      data-id="initiative-bar-turn"
    >
      {{ active ? $t('combat.turnNow', { name: activeName }) : '' }}
    </span>
    <template v-if="role === 'gm'">
      <v-btn
        variant="text"
        icon
        size="small"
        :aria-label="$t('initiative.previous')"
        @click="run('previous', () => advanceInitiative.callAsync({ folderId: folder._id, step: -1 }))"
      >
        <v-icon>mdi-chevron-left</v-icon>
      </v-btn>
      <v-btn
        variant="flat"
        color="primary"
        append-icon="mdi-chevron-right"
        :loading="slow === 'next'"
        data-id="initiative-bar-next"
        @click="run('next', () => advanceInitiative.callAsync({ folderId: folder._id, step: 1 }))"
      >
        {{ $t('initiative.next') }}
      </v-btn>
    </template>
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue';
import initiativeOrder from '/imports/api/creature/creatureFolders/initiativeOrder';
import { advanceInitiative } from '/imports/api/creature/creatureFolders/methods/initiativeMethods';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { autorun } from 'vue-meteor-tracker';

/**
 * The fight in one line, kept in view at the top of a party board below lg,
 * where the tracker comes after the cards (UX4): the round, whose turn it is,
 * and for the game master the previous and next turn buttons.
 */
const props = defineProps({
  folder: {
    type: Object,
    required: true,
  },
  // 'gm' or 'member'
  role: {
    type: String,
    default: 'member',
  },
});

const round = computed(() => props.folder.initiative?.round || 0);
const active = computed(() => {
  const tracker = props.folder.initiative;
  return tracker && initiativeOrder(tracker.entries || [])[tracker.turn || 0];
});
// A character's current name, which may have changed since it rolled
const activeName = autorun(() => {
  const entry = active.value;
  if (!entry) return '';
  return (entry.creatureId && Creatures.findOne(entry.creatureId, { fields: { name: 1 } })?.name) || entry.name;
}).result;

// The turn moves at once (the method's client simulation): a spinner only
// when the server takes more than 600ms, as on the tracker
const slow = ref(null);
async function run(name, call) {
  const timer = setTimeout(() => { slow.value = name; }, 600);
  try {
    await call();
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message || error.toString() });
  } finally {
    clearTimeout(timer);
    slow.value = null;
  }
}
</script>
