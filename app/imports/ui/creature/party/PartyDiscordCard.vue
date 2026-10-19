<template>
  <v-card
    v-if="role === 'gm' || noticeKey"
    data-id="party-discord"
  >
    <v-card-item>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon>$discord</v-icon>
        {{ $t('discord.partyTitle') }}
      </v-card-title>
    </v-card-item>

    <!-- The players learn what the party posts to Discord, never where -->
    <v-card-text
      v-if="role !== 'gm'"
      class="text-body-medium"
      data-id="party-discord-notice"
    >
      {{ $t(noticeKey || '') }}
    </v-card-text>

    <template v-else>
      <v-card-text class="pb-0">
        <p class="text-body-medium mt-0">
          {{ $t('discord.partyText') }}
        </p>
        <!-- Connected (D4): Discord's own channel picker; the token stays on the server -->
        <discord-connect-controls
          :channel="folder.discord?.channel"
          :available="discordOAuth"
          :busy="busy"
          class="mb-4"
          @connect="connect"
          @disconnect="disconnect"
        />
        <!-- Or pasted: the way for a forum channel, which the picker never offers.
             Its URL stays on the server: the board only knows the webhook's id -->
        <discord-pasted-webhook
          v-if="!folder.discord?.channel"
          :webhook-id="folder.discord?.webhookId"
          :label="$t('discord.partyWebhook')"
          :hint="$t('discord.partyWebhookHint')"
          :busy="busy === 'save' || busy === 'remove' ? busy : undefined"
          data-id="party-discord"
          class="mb-2"
          @save="save"
          @remove="remove"
        />
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
          :holder="{ folderId: folder._id }"
          :session="session"
          :closed="folder.discord?.sessionClosed"
          :history="folder.discord?.sessionHistory"
          :here="here"
          :disabled="!!busy"
        />
      </v-card-text>
      <v-card-text
        v-else-if="webhookId && folder.discord?.enabled !== false"
        class="text-body-small text-medium-emphasis"
      >
        {{ $t('discord.sessionsOff') }}
      </v-card-text>
    </template>
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { setPartyWebhook, setPartyPublishing } from '/imports/api/creature/creatureFolders/methods/discordMethods';
import { PUBLISH_KINDS, publishes, postingKey } from '/imports/api/creature/log/discord/partyPublishing';
import { sessionOf } from '/imports/api/creature/log/discord/discordSession';
import { webhookIdOf } from '/imports/api/creature/log/discord/discordChannel';
import { discordConnectUrl, discordDisconnect } from '/imports/api/discord/methods/discordOAuthMethods';
import DiscordSessionControls from '/imports/ui/creature/discord/DiscordSessionControls.vue';
import DiscordConnectControls from '/imports/ui/creature/discord/DiscordConnectControls.vue';
import DiscordPastedWebhook from '/imports/ui/creature/discord/DiscordPastedWebhook.vue';
import { bindToThisBrowser } from '/imports/ui/discord/discordNonce';
import { Meteor } from 'meteor/meteor';
import boardErrorText from '/imports/ui/creature/party/boardErrorText';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';

/**
 * The party's Discord channel (D2, D3). The game master connects it, or
 * pastes its webhook, whose URL the server keeps (they get its id, in the
 * folder's `discord` field, which only they receive), chooses what it
 * posts, and opens, resumes and ends the sessions; the players see what the
 * party posts there, so they know where their characters' rolls go.
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

// Connected, else pasted
const webhookId = computed(() => webhookIdOf(props.folder.discord?.channel, props.folder.discord?.webhookId));
// A session of another webhook is over
const session = computed(() => sessionOf(props.folder.discord?.session, webhookId.value));
// The channel it posts in: connected (a text channel unless /connect said a
// forum), or pasted (its channel and what it is, once Discord said)
const here = computed(() => {
  const discord = props.folder.discord;
  if (!discord?.channel) return { webhookId: webhookId.value, channelId: discord?.webhookChannelId, kind: discord?.webhookChannelKind };
  const { channelId, guildId, kind = 'text' } = discord.channel;
  return { webhookId: webhookId.value, channelId, guildId, kind };
});

// The players' notice: what the party posts, rolls or fights
const noticeKey = computed(() => postingKey(props.folder.discordPosting));

// 'save', 'remove', 'enabled', a kind, 'connect' or 'disconnect' while its method runs
const busy = ref(/** @type {string | undefined} */ (undefined));

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

function save(url, done) {
  run('save', async () => {
    await setPartyWebhook.callAsync({ folderId: props.folder._id, webhook: url });
    done();
    snackbar({ text: t('discord.webhookSaved') });
  });
}

function remove() {
  run('remove', async () => {
    await setPartyWebhook.callAsync({ folderId: props.folder._id });
    snackbar({ text: t('discord.webhookRemoved') });
  });
}

function setPublishing(name, change) {
  run(name, () => setPartyPublishing.callAsync({ folderId: props.folder._id, ...change }));
}

// "Connect to Discord" (D4), when this server has a Discord application
const discordOAuth = !!Meteor.settings.public?.discordOAuth;

async function connect() {
  busy.value = 'connect';
  try {
    // Discord's page, which comes back to this board with the result, to this browser alone
    const url = await discordConnectUrl.callAsync({
      folderId: props.folder._id, returnTo: `/party/${props.folder._id}`, nonceHash: await bindToThisBrowser('connect'),
    });
    if (url) window.location.assign(url);
    else busy.value = undefined;
  } catch (error) {
    console.error(error);
    snackbar({ text: boardErrorText(error, t) });
    busy.value = undefined;
  }
}

function disconnect() {
  run('disconnect', async () => {
    await discordDisconnect.callAsync({ folderId: props.folder._id });
    snackbar({ text: t('discord.connect.disconnected') });
  });
}
</script>
