<template>
  <div
    class="bg-page"
    style="height: 100%"
  >
    <v-container>
      <v-row class="justify-center">
        <v-col
          cols="12"
          sm="10"
          md="7"
          lg="5"
        >
          <div
            v-if="loading"
            class="d-flex justify-center pa-8"
          >
            <v-progress-circular
              indeterminate
              color="primary"
              size="64"
            />
          </div>
          <v-empty-state
            v-else-if="error"
            icon="mdi-link-variant-off"
            :title="$t('party.invitationInvalid')"
            :text="error"
            data-id="party-join-error"
          />
          <v-card
            v-else-if="invite"
            data-id="party-join"
          >
            <v-card-item>
              <template #prepend>
                <v-icon
                  size="40"
                  color="primary"
                >
                  mdi-account-group-outline
                </v-icon>
              </template>
              <v-card-title class="text-wrap">
                {{ invite.name || $t('party.untitled') }}
              </v-card-title>
              <v-card-subtitle>
                {{ $t('party.joinSubtitle', { gm: invite.gmName || $t('party.unknownPlayer') }) }}
              </v-card-subtitle>
            </v-card-item>
            <v-card-text v-if="invite.role === 'gm'">
              {{ $t('party.youAreGm') }}
            </v-card-text>
            <v-card-text v-else>
              <p class="mt-0">
                {{ invite.role === 'member' ? $t('party.joinMoreHint') : $t('party.joinHint') }}
              </p>
              <party-character-picker v-model="creatureIds" />
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn
                v-if="invite.role"
                variant="text"
                :to="`/party/${invite.folderId}`"
                data-id="party-join-open"
              >
                {{ $t('party.openBoard') }}
              </v-btn>
              <v-btn
                v-if="invite.role !== 'gm'"
                variant="flat"
                color="primary"
                :loading="joining"
                data-id="party-join-submit"
                @click="join"
              >
                {{ invite.role === 'member' ? $t('party.bringCharacters') : $t('party.join') }}
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { getPartyInvite, joinParty } from '/imports/api/creature/creatureFolders/methods/partyMethods';
import PartyCharacterPicker from '/imports/ui/creature/party/PartyCharacterPicker.vue';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import { useAppStore } from '/imports/ui/stores/app';

/** Where a party's invitation link leads: join it with some of your characters */
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const appStore = useAppStore();

const invite = ref(undefined);
const error = ref(undefined);
const loading = ref(true);
const joining = ref(false);
const creatureIds = ref([]);

onMounted(async () => {
  try {
    invite.value = await getPartyInvite.callAsync({ token: route.params.token });
    appStore.setPageTitle(invite.value.name || t('party.untitled'));
  } catch (e) {
    error.value = e.error === 'party.invite-not-found'
      ? t('party.invitationInvalidText')
      : e.reason || e.message;
  } finally {
    loading.value = false;
  }
});

async function join() {
  joining.value = true;
  try {
    const folderId = await joinParty.callAsync({
      token: route.params.token,
      creatureIds: creatureIds.value,
    });
    snackbar({ text: t('party.joined', { name: invite.value.name || t('party.untitled') }) });
    await router.push(`/party/${folderId}`);
  } catch (e) {
    console.error(e);
    snackbar({ text: e.reason || e.message });
  } finally {
    joining.value = false;
  }
}
</script>
