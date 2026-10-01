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
          v-else-if="!folder"
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
            </div>
            <v-empty-state
              v-if="!creatures.length"
              icon="mdi-account-group-outline"
              :title="$t('party.emptyTitle')"
              :text="$t('party.emptyText')"
            />
            <v-row density="compact">
              <v-col
                v-for="creature in creatures"
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
            <initiative-tracker
              class="party-board__tracker"
              :folder="folder"
              :creatures="creatures"
            />
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
import PartyMemberCard from '/imports/ui/creature/party/PartyMemberCard.vue';
import InitiativeTracker from '/imports/ui/creature/party/InitiativeTracker.vue';
import initiativeOrder from '/imports/api/creature/creatureFolders/initiativeOrder';
import { useAppStore } from '/imports/ui/stores/app';

/**
 * A character folder as a live board for the table: one card per character
 * in it, with what a game master checks at a glance.
 */
const route = useRoute();
const { t } = useI18n();
const appStore = useAppStore();

const folderId = computed(() => route.params.id);
const { ready } = subscribe(() => ['partyBoard', folderId.value]);

const folder = autorun(() => CreatureFolders.findOne(folderId.value)).result;

// In the folder's order, those the viewer can see
const creatures = autorun(() => {
  const ids = folder.value?.creatures || [];
  const found = Creatures.find({ _id: { $in: ids } }).fetch();
  return ids.map(id => found.find(creature => creature._id === id)).filter(Boolean);
}).result;

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
/* The tracker stays in view while the board scrolls */
.party-board__tracker {
  position: sticky;
  top: calc(var(--v-layout-top) + 16px);
}
</style>
