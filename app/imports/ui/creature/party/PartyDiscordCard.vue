<template>
  <v-card
    v-if="role === 'gm' || noticeKey"
    data-id="party-discord"
  >
    <v-card-item>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon>mdi-discord</v-icon>
        {{ $t('discord.partyTitle') }}
      </v-card-title>
    </v-card-item>

    <!-- The players learn what the party posts to Discord, never where -->
    <v-card-text
      v-if="role !== 'gm'"
      class="text-body-medium"
      data-id="party-discord-notice"
    >
      {{ $t(noticeKey) }}
    </v-card-text>

    <template v-else>
      <v-card-text class="pb-0">
        <p class="text-body-medium mt-0">
          {{ $t('discord.partyText') }}
        </p>
        <form
          class="d-flex flex-wrap align-start ga-2"
          @submit.prevent="save"
        >
          <v-text-field
            v-model="webhook"
            :label="$t('discord.partyWebhook')"
            :hint="$t('discord.partyWebhookHint')"
            persistent-hint
            placeholder="https://discord.com/api/webhooks/<id>/<token>"
            variant="outlined"
            density="compact"
            autocomplete="off"
            spellcheck="false"
            class="flex-1-1"
            style="min-width: 200px;"
            data-id="party-discord-webhook"
          />
          <v-btn
            type="submit"
            variant="tonal"
            :disabled="!changed"
            :loading="busy === 'save'"
            data-id="party-discord-save"
          >
            {{ $t('discord.save') }}
          </v-btn>
        </form>
      </v-card-text>
      <!-- What it posts: all of it at first, everything off without forgetting the webhook -->
      <v-card-text
        v-if="webhookId"
        class="pb-0"
      >
        <v-switch
          :model-value="folder.discord?.enabled !== false"
          :label="$t('discord.publishing')"
          :hint="$t('discord.publishingHint')"
          persistent-hint
          color="primary"
          density="compact"
          :loading="busy === 'enabled'"
          data-id="party-discord-enabled"
          @update:model-value="value => setPublishing('enabled', { enabled: !!value })"
        />
        <div class="text-label-large mt-3">
          {{ $t('discord.publishWhat') }}
        </div>
        <v-checkbox
          v-for="kind in PUBLISH_KINDS"
          :key="kind"
          :model-value="folder.discord?.publish?.[kind] !== false"
          :label="$t(`discord.publish.${kind}`)"
          :disabled="folder.discord?.enabled === false"
          color="primary"
          density="compact"
          hide-details
          :data-id="`party-discord-publish-${kind}`"
          @update:model-value="value => setPublishing(kind, { publish: { [kind]: !!value } })"
        />
      </v-card-text>
      <v-card-text v-if="webhookId && publishes(folder.discord, 'sessions')">
        <discord-session-controls
          :session="session"
          :busy="busy"
          @start="startSession"
          @end="endSession"
        />
      </v-card-text>
      <v-card-text
        v-else-if="webhookId && folder.discord?.enabled !== false"
        class="text-body-small text-medium-emphasis"
      >
        {{ $t('discord.sessionsOff') }}
      </v-card-text>
      <v-card-actions
        v-if="saved"
        class="px-4"
      >
        <v-spacer />
        <v-btn
          variant="text"
          prepend-icon="mdi-link-variant-off"
          :loading="busy === 'remove'"
          data-id="party-discord-remove"
          @click="remove"
        >
          {{ $t('discord.remove') }}
        </v-btn>
      </v-card-actions>
    </template>
  </v-card>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  setPartyWebhook, setPartyPublishing, startPartySession, endPartySession,
} from '/imports/api/creature/creatureFolders/methods/discordMethods';
import { PUBLISH_KINDS, publishes, postingKey } from '/imports/api/creature/log/discord/partyPublishing';
import { parseWebhookURL } from '/imports/api/creature/log/discord/webhookUrl';
import { sessionOf } from '/imports/api/creature/log/discord/discordSession';
import DiscordSessionControls from '/imports/ui/creature/discord/DiscordSessionControls.vue';
import boardErrorText from '/imports/ui/creature/party/boardErrorText';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';

/**
 * The party's Discord channel (D2, D3). The game master pastes its webhook,
 * which only they receive (the folder's `discord` field), chooses what it
 * posts, and opens and ends the sessions; the players see what the party
 * posts there, so they know where their characters' rolls go.
 */
const props = defineProps({
  folder: {
    type: Object,
    required: true,
  },
  // 'gm' or 'member'
  role: {
    type: String,
    required: true,
  },
});

const { t } = useI18n();

const saved = computed(() => props.folder.discord?.webhook || '');
// What the game master types, until it is saved
const webhook = ref(saved.value);
watch(saved, value => { webhook.value = value; });
const changed = computed(() => webhook.value.trim() !== saved.value);

const webhookId = computed(() => parseWebhookURL(saved.value)?.id);
// A session of another webhook is over
const session = computed(() => sessionOf(props.folder.discord?.session, webhookId.value));

// The players' notice: what the party posts, rolls or fights
const noticeKey = computed(() => postingKey(props.folder.discordPosting));

// 'save', 'remove', 'enabled', a kind, 'start' or 'end' while its method runs
const busy = ref(undefined);

async function run(name, call) {
  busy.value = name;
  try {
    return await call();
  } catch (error) {
    console.error(error);
    snackbar({ text: boardErrorText(error, t) });
  } finally {
    busy.value = undefined;
  }
}

function save() {
  const value = webhook.value.trim();
  run('save', async () => {
    await setPartyWebhook.callAsync({ folderId: props.folder._id, webhook: value });
    snackbar({ text: value ? t('discord.webhookSaved') : t('discord.webhookRemoved') });
  });
}

function remove() {
  run('remove', async () => {
    await setPartyWebhook.callAsync({ folderId: props.folder._id });
    webhook.value = '';
    snackbar({ text: t('discord.webhookRemoved') });
  });
}

function setPublishing(name, change) {
  run(name, () => setPartyPublishing.callAsync({ folderId: props.folder._id, ...change }));
}

function startSession() {
  run('start', async () => {
    const opened = await startPartySession.callAsync({
      folderId: props.folder._id,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (!opened) return;
    snackbar({
      text: opened.kind === 'forum'
        ? t('discord.sessionStartedForum', { name: opened.name })
        : t('discord.sessionStartedChannel'),
    });
  });
}

function endSession() {
  run('end', async () => {
    await endPartySession.callAsync({ folderId: props.folder._id });
    snackbar({ text: t('discord.sessionEnded') });
  });
}
</script>
