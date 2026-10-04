<template>
  <v-card data-id="party-players">
    <v-card-item>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon>mdi-account-group-outline</v-icon>
        {{ $t('party.players') }}
      </v-card-title>
    </v-card-item>

    <v-list
      density="compact"
      class="py-0"
    >
      <v-list-item
        :title="username(folder.owner)"
        :subtitle="$t('party.gameMaster')"
        prepend-icon="mdi-crown-outline"
        data-id="party-gm"
      />
      <v-list-item
        v-for="memberId in folder.members || []"
        :key="memberId"
        :title="username(memberId)"
        :subtitle="characterNames(memberId)"
        prepend-icon="mdi-account-outline"
        :data-id="`party-player-${memberId}`"
      >
        <template
          v-if="role === 'gm'"
          #append
        >
          <v-menu>
            <template #activator="{ props: menuProps }">
              <v-btn
                v-bind="menuProps"
                variant="text"
                icon
                size="small"
                :aria-label="$t('party.removePlayer', { name: username(memberId) })"
                :data-id="`party-remove-${memberId}`"
              >
                <v-icon>mdi-account-remove-outline</v-icon>
              </v-btn>
            </template>
            <v-list>
              <v-list-item
                prepend-icon="mdi-account-remove-outline"
                :title="$t('party.removePlayer', { name: username(memberId) })"
                :subtitle="$t('party.removePlayerHint')"
                :data-id="`party-remove-confirm-${memberId}`"
                @click="run(() => removePartyMember.callAsync({ folderId: folder._id, userId: memberId }))"
              />
            </v-list>
          </v-menu>
        </template>
      </v-list-item>
    </v-list>

    <template v-if="role === 'gm'">
      <v-divider />
      <v-card-text data-id="party-invite">
        <div class="text-label-large mb-2">
          {{ $t('party.invitation') }}
        </div>
        <template v-if="inviteLink">
          <v-text-field
            :model-value="inviteLink"
            readonly
            variant="outlined"
            density="compact"
            hide-details
            :aria-label="$t('party.invitation')"
            append-inner-icon="mdi-content-copy"
            data-id="party-invite-link"
            @click:append-inner="copyLink"
            @focus="event => event.target.select()"
          />
          <p class="text-body-small text-medium-emphasis mt-2 mb-0">
            {{ $t('party.invitationHint') }}
          </p>
        </template>
        <p
          v-else
          class="text-body-medium text-medium-emphasis my-0"
        >
          {{ $t('party.noInvitation') }}
        </p>
      </v-card-text>
      <v-card-actions class="flex-wrap px-4">
        <v-btn
          variant="tonal"
          prepend-icon="mdi-link-variant"
          :loading="busy"
          data-id="party-invite-create"
          @click="run(() => createPartyInvite.callAsync({ folderId: folder._id }))"
        >
          {{ inviteLink ? $t('party.newInvitation') : $t('party.invite') }}
        </v-btn>
        <v-btn
          v-if="inviteLink"
          variant="text"
          prepend-icon="mdi-link-variant-off"
          data-id="party-invite-revoke"
          @click="run(() => revokePartyInvite.callAsync({ folderId: folder._id }))"
        >
          {{ $t('party.turnOffInvitation') }}
        </v-btn>
      </v-card-actions>
    </template>

    <template v-else-if="role === 'member'">
      <v-divider />
      <v-card-actions class="flex-wrap px-4">
        <v-btn
          variant="tonal"
          prepend-icon="mdi-account-multiple-plus-outline"
          data-id="party-my-characters"
          @click="chooseCharacters"
        >
          {{ $t('party.myCharacters') }}
        </v-btn>
        <v-menu>
          <template #activator="{ props: menuProps }">
            <v-btn
              v-bind="menuProps"
              variant="text"
              prepend-icon="mdi-exit-run"
              data-id="party-leave"
            >
              {{ $t('party.leave') }}
            </v-btn>
          </template>
          <v-list>
            <v-list-item
              prepend-icon="mdi-exit-run"
              :title="$t('party.leave')"
              :subtitle="$t('party.leaveHint')"
              data-id="party-leave-confirm"
              @click="leave"
            />
          </v-list>
        </v-menu>
      </v-card-actions>
    </template>
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue';
import { Meteor } from 'meteor/meteor';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  createPartyInvite, revokePartyInvite, removePartyMember, leaveParty,
} from '/imports/api/creature/creatureFolders/methods/partyMethods';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

/**
 * Who is at the table: the game master and the players. The game master
 * shares the invitation link and removes players; a player chooses the
 * characters they bring, or leaves.
 */
const props = defineProps({
  folder: {
    type: Object,
    required: true,
  },
  creatures: {
    type: Array,
    default: () => [],
  },
  // 'gm' or 'member'
  role: {
    type: String,
    required: true,
  },
});

const { t } = useI18n();
const router = useRouter();
const dialogStackStore = useDialogStackStore();
const busy = ref(false);

const inviteLink = computed(() => props.folder.inviteToken
  && Meteor.absoluteUrl(`party/join/${props.folder.inviteToken}`));

function username(userId) {
  return Meteor.users.findOne(userId, { fields: { username: 1 } })?.username || t('party.unknownPlayer');
}

function characterNames(userId) {
  return props.creatures.filter(creature => creature.owner === userId)
    .map(creature => creature.name).join(', ') || t('party.noCharacter');
}

async function run(call) {
  busy.value = true;
  try {
    await call();
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message });
  } finally {
    busy.value = false;
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(inviteLink.value);
    snackbar({ text: t('party.invitationCopied') });
  } catch (error) {
    console.error(error);
  }
}

function chooseCharacters() {
  const userId = Meteor.userId();
  dialogStackStore.pushDialogStack({
    component: 'party-characters-dialog',
    elementId: 'party-my-characters',
    data: {
      folderId: props.folder._id,
      creatureIds: props.creatures.filter(creature => creature.owner === userId).map(creature => creature._id),
    },
  });
}

async function leave() {
  await run(async () => {
    await leaveParty.callAsync({ folderId: props.folder._id });
    snackbar({ text: t('party.left', { name: props.folder.name || t('party.untitled') }) });
    await router.push('/character-list');
  });
}
</script>
