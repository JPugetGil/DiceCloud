<template>
  <div
    v-if="fights.length"
    class="d-flex flex-column ga-2"
  >
    <v-alert
      v-for="fight in fights"
      :key="fight.folderId"
      :color="fight.ownTurn ? 'primary' : undefined"
      :variant="fight.ownTurn ? 'flat' : 'tonal'"
      density="compact"
      :icon="fight.ownTurn ? 'mdi-sword-cross' : 'mdi-timer-sand'"
      :data-id="fight.ownTurn ? 'your-turn' : 'combat-turn'"
      role="status"
    >
      <span
        v-if="fight.ownTurn"
        class="font-weight-medium"
      >{{ $t('combat.yourTurn') }}</span>
      <span v-else>{{ $t('combat.turnOf', { name: fight.activeName }) }}</span>
      <span> · {{ $t('combat.roundIn', { round: fight.round, party: fight.folderName }) }}</span>
      <!-- On a phone the link goes under the text, which it squeezed beside it -->
      <div
        v-if="fight.canOpenBoard && xs"
        class="mt-1 ms-n2"
      >
        <v-btn
          variant="text"
          size="small"
          append-icon="mdi-arrow-right"
          :to="`/party/${fight.folderId}`"
        >
          {{ $t('combat.openBoard') }}
        </v-btn>
      </div>
      <template
        v-if="fight.canOpenBoard && !xs"
        #append
      >
        <v-btn
          variant="text"
          size="small"
          append-icon="mdi-arrow-right"
          :to="`/party/${fight.folderId}`"
        >
          {{ $t('combat.openBoard') }}
        </v-btn>
      </template>
    </v-alert>
  </div>
</template>

<script setup>
import { Meteor } from 'meteor/meteor';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import initiativeOrder from '/imports/api/creature/creatureFolders/initiativeOrder';
import { getPartyRole } from '/imports/api/creature/creatureFolders/party';

/**
 * The fights the character is in, on its sheet (UX4): "Your turn" when it
 * is, otherwise whose turn it is, with the round and the party, and a link
 * to the party board for those who sit at that table.
 */
const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
});

const { t } = useI18n();
const { xs } = useDisplay();

subscribe(() => ['characterCombat', props.creatureId]);

const fights = autorun(() => {
  const userId = Meteor.userId();
  return CreatureFolders.find({
    creatures: props.creatureId,
    'initiative.round': { $gt: 0 },
  }, { sort: { name: 1 } }).map(folder => {
    const tracker = folder.initiative;
    const active = initiativeOrder(tracker.entries || [])[tracker.turn || 0];
    return {
      folderId: folder._id,
      folderName: folder.name || t('party.untitled'),
      round: tracker.round,
      ownTurn: active?.creatureId === props.creatureId,
      activeName: active?.name || '–',
      canOpenBoard: !!getPartyRole(folder, userId),
    };
  });
}).result;
</script>
