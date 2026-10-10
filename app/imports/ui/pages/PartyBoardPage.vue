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
                data-id="party-character-count"
              >
                {{ $t('party.memberCount', { count: characters.length }, characters.length) }}
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
              <!-- The party's characters: the monsters neither rest nor gain experience -->
              <party-actions
                v-if="role === 'gm' && characters.length"
                :creatures="characters"
              />
            </div>
            <v-empty-state
              v-if="!characters.length"
              icon="mdi-account-group-outline"
              :title="$t('party.emptyTitle')"
              :text="role === 'gm' ? $t('party.emptyText') : $t('party.emptyTextPlayer')"
            />
            <v-row density="compact">
              <v-col
                v-for="creature in ordered(characters)"
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

            <!-- The game master's monsters, from their bestiaries -->
            <section
              v-if="role === 'gm' || monsters.length"
              class="mt-6"
              data-id="party-monsters"
            >
              <div class="d-flex align-center flex-wrap ga-2 mb-3">
                <h2 class="text-title-large my-0">
                  {{ $t('monsters.title') }}
                </h2>
                <v-chip
                  v-if="role === 'gm'"
                  size="small"
                  variant="tonal"
                  prepend-icon="mdi-paw"
                  :aria-label="$t('monsters.countLabel', { count: monsters.length, limit: MAX_BOARD_MONSTERS })"
                  data-id="party-monster-count"
                >
                  {{ $t('monsters.count', { count: monsters.length, limit: MAX_BOARD_MONSTERS }) }}
                </v-chip>
                <v-spacer />
                <template v-if="role === 'gm'">
                  <v-menu v-if="monsters.length">
                    <template #activator="{ props: menuProps }">
                      <v-btn
                        v-bind="menuProps"
                        variant="text"
                        prepend-icon="mdi-flag-checkered"
                        :loading="ending"
                        data-id="party-end-encounter"
                      >
                        {{ $t('monsters.endEncounter') }}
                      </v-btn>
                    </template>
                    <v-list>
                      <v-list-item
                        prepend-icon="mdi-flag-checkered"
                        :title="$t('monsters.endEncounter')"
                        :subtitle="$t('monsters.endEncounterHint', { count: monsters.length }, monsters.length)"
                        data-id="party-end-encounter-confirm"
                        @click="endTheEncounter"
                      />
                    </v-list>
                  </v-menu>
                  <v-btn
                    variant="tonal"
                    color="primary"
                    prepend-icon="mdi-plus"
                    data-id="party-add-monsters"
                    @click="addMonsters"
                  >
                    {{ $t('monsters.add') }}
                  </v-btn>
                </template>
              </div>
              <v-row density="compact">
                <v-col
                  v-for="creature in ordered(monsters)"
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
            </section>
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
              <party-discord-card
                :folder="folder"
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
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { useI18n } from 'vue-i18n';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { Meteor } from 'meteor/meteor';
import PartyActions from '/imports/ui/creature/party/PartyActions.vue';
import PartyPlayersCard from '/imports/ui/creature/party/PartyPlayersCard.vue';
import PartyDiscordCard from '/imports/ui/creature/party/PartyDiscordCard.vue';
import { getPartyRole } from '/imports/api/creature/creatureFolders/party';
import PartyMemberCard from '/imports/ui/creature/party/PartyMemberCard.vue';
import InitiativeTracker from '/imports/ui/creature/party/InitiativeTracker.vue';
import InitiativeBar from '/imports/ui/creature/party/InitiativeBar.vue';
import { useDisplay } from 'vuetify';
import initiativeOrder from '/imports/api/creature/creatureFolders/initiativeOrder';
import { useAppStore } from '/imports/ui/stores/app';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import { endEncounter } from '/imports/api/creature/creatureFolders/methods/monsterMethods';
import { MAX_BOARD_MONSTERS } from '/imports/api/creature/creatureFolders/boardMonsters';
import boardErrorText from '/imports/ui/creature/party/boardErrorText';

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

// The party's characters, and the game master's monsters (type 'monster')
const characters = computed(() => (creatures.value || []).filter(creature => creature.type !== 'monster'));
const monsters = computed(() => (creatures.value || []).filter(creature => creature.type === 'monster'));

const { lgAndUp } = useDisplay();

// During a fight the cards follow the initiative order, those not in it last
const initiativeRank = computed(() => {
  const tracker = folder.value?.initiative;
  if (!tracker?.round) return undefined;
  return new Map(initiativeOrder(tracker.entries)
    .filter(entry => entry.creatureId)
    .map((entry, index) => [entry.creatureId, index]));
});
function ordered(list) {
  const rank = initiativeRank.value;
  if (!rank) return list;
  return [...list].sort((a, b) => (rank.get(a._id) ?? Infinity) - (rank.get(b._id) ?? Infinity));
}

const dialogStackStore = useDialogStackStore();

function addMonsters() {
  dialogStackStore.pushDialogStack({
    component: 'monster-picker-dialog',
    elementId: 'party-add-monsters',
    data: {
      folderId: folderId.value,
      monsterCount: monsters.value.length,
      inFight: !!folder.value?.initiative?.round,
    },
  });
}

// The monsters go, and the combat ends with them (the user's choice, 2026-10-07)
const ending = ref(false);
async function endTheEncounter() {
  ending.value = true;
  try {
    const removed = await endEncounter.callAsync({ folderId: folderId.value, endCombat: true });
    snackbar({ text: t('monsters.encounterEnded', { count: removed }, removed) });
  } catch (error) {
    console.error(error);
    snackbar({ text: boardErrorText(error, t) });
  } finally {
    ending.value = false;
  }
}

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
