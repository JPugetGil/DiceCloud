<template>
  <div
    class="bg-page"
    style="height: 100%"
  >
    <v-container fluid>
      <v-fade-transition mode="out-in">
        <div
          v-if="!ready"
          key="loading"
          class="d-flex justify-center pa-8"
        >
          <v-progress-circular
            indeterminate
            color="primary"
            size="64"
          />
        </div>
        <v-empty-state
          v-else-if="!folder || !role"
          key="missing"
          icon="mdi-folder-alert-outline"
          :title="$t('party.notFound')"
        />
        <v-row
          v-else
          key="board"
        >
          <v-col
            cols="12"
            lg="8"
          >
            <!-- Below lg the tracker comes after the cards: the turn stays in view up here -->
            <initiative-bar
              v-if="!lgAndUp && folder.initiative?.round"
              :folder="folder"
              :role="role"
              class="party-board__turn-bar mb-3"
            />
            <div class="d-flex align-center flex-wrap ga-2 mb-3">
              <h1 class="text-headline-small my-0">
                {{ folder.name || $t('party.untitled') }}
              </h1>
              <v-chip
                size="small"
                variant="tonal"
                prepend-icon="mdi-account-group-outline"
              >
                {{ $t('party.memberCount', { count: creatures.length }, creatures.length) }}
              </v-chip>
              <v-chip
                v-if="role === 'member'"
                size="small"
                variant="outlined"
                prepend-icon="mdi-crown-outline"
              >
                {{ $t('party.gmChip', { name: gmName }) }}
              </v-chip>
              <v-spacer />
              <party-actions
                v-if="role === 'gm' && creatures.length"
                :creatures="creatures"
              />
            </div>
            <v-empty-state
              v-if="!creatures.length"
              icon="mdi-account-group-outline"
              :title="$t('party.emptyTitle')"
              :text="role === 'gm' ? $t('party.emptyText') : $t('party.emptyTextPlayer')"
            />
            <v-row density="compact">
              <v-col
                v-for="creature in orderedCreatures"
                :key="creature._id"
                cols="12"
                sm="6"
                xl="4"
              >
                <party-member-card
                  :creature="creature"
                  :has-turn="creature._id === activeCreatureId"
                />
              </v-col>
            </v-row>
          </v-col>
          <v-col
            cols="12"
            lg="4"
          >
            <div class="party-board__side d-flex flex-column ga-4">
              <initiative-tracker
                :folder="folder"
                :creatures="creatures"
                :role="role"
              />
              <party-players-card
                :folder="folder"
                :creatures="creatures"
                :role="role"
              />
            </div>
          </v-col>
        </v-row>
      </v-fade-transition>
    </v-container>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { useI18n } from 'vue-i18n';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { Meteor } from 'meteor/meteor';
import PartyActions from '/imports/ui/creature/party/PartyActions.vue';
import PartyPlayersCard from '/imports/ui/creature/party/PartyPlayersCard.vue';
import { getPartyRole } from '/imports/api/creature/creatureFolders/party';
import PartyMemberCard from '/imports/ui/creature/party/PartyMemberCard.vue';
import InitiativeTracker from '/imports/ui/creature/party/InitiativeTracker.vue';
import InitiativeBar from '/imports/ui/creature/party/InitiativeBar.vue';
import { useDisplay } from 'vuetify';
import initiativeOrder from '/imports/api/creature/creatureFolders/initiativeOrder';
import { useAppStore } from '/imports/ui/stores/app';

/**
 * A character folder as a live board for the table: one card per character
 * in it, with what a game master checks at a glance. Its owner is the game
 * master; the players who joined it see it too, and the tracker.
 */
const route = useRoute();
const { t } = useI18n();
const appStore = useAppStore();

const folderId = computed(() => route.params.id);
const { ready } = subscribe(() => ['partyBoard', folderId.value]);

const folder = autorun(() => CreatureFolders.findOne(folderId.value)).result;

// 'gm' or 'member'; undefined while loading, or when the board isn't theirs
const role = autorun(() => getPartyRole(folder.value, Meteor.userId())).result;

const gmName = autorun(() => folder.value
  && Meteor.users.findOne(folder.value.owner, { fields: { username: 1 } })?.username).result;

// In the folder's order, those the viewer can see
const creatures = autorun(() => {
  const ids = folder.value?.creatures || [];
  const found = Creatures.find({ _id: { $in: ids } }).fetch();
  return ids.map(id => found.find(creature => creature._id === id)).filter(Boolean);
}).result;

const { lgAndUp } = useDisplay();

// During a fight the cards follow the initiative order, those not in it last
const orderedCreatures = computed(() => {
  const tracker = folder.value?.initiative;
  const list = creatures.value || [];
  if (!tracker?.round) return list;
  const rank = new Map(initiativeOrder(tracker.entries)
    .filter(entry => entry.creatureId)
    .map((entry, index) => [entry.creatureId, index]));
  return [...list].sort((a, b) => (rank.get(a._id) ?? Infinity) - (rank.get(b._id) ?? Infinity));
});

// The character whose turn it is, outlined on the board
const activeCreatureId = computed(() => {
  const tracker = folder.value?.initiative;
  if (!tracker?.round) return undefined;
  return initiativeOrder(tracker.entries)[tracker.turn]?.creatureId;
});

watch(() => folder.value?.name, name => {
  appStore.setPageTitle(name || t('pageTitle.partyBoard'));
}, { immediate: true });
</script>

<style scoped>
/* The tracker and the players stay in view while the board scrolls */
.party-board__side {
  position: sticky;
  top: calc(var(--v-layout-top) + 16px);
}

.party-board__turn-bar {
  position: sticky;
  top: calc(var(--v-layout-top) + 8px);
  z-index: 2;
}
</style>
