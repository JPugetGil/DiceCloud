<template>
  <div
    class="discord-connect"
    data-id="discord-connect"
  >
    <template v-if="channel">
      <p
        class="text-body-medium d-flex align-center ga-2 my-0"
        data-id="discord-connected"
      >
        <v-icon
          size="small"
          color="success"
        >
          mdi-check-circle-outline
        </v-icon>
        {{ $t(channel.kind === 'forum' ? 'discord.connect.connectedForum' : 'discord.connect.connected') }}
      </p>
      <div class="d-flex flex-wrap ga-2 mt-2">
        <v-btn
          v-if="channelUrl"
          variant="tonal"
          prepend-icon="mdi-open-in-new"
          :href="channelUrl"
          target="_blank"
          rel="noopener"
          data-id="discord-open-channel"
        >
          {{ $t('discord.connect.openChannel') }}
        </v-btn>
        <v-btn
          variant="text"
          prepend-icon="mdi-link-variant-off"
          :loading="busy === 'disconnect'"
          :disabled="disabled || !!busy"
          data-id="discord-disconnect"
          @click="emit('disconnect')"
        >
          {{ $t('discord.connect.disconnect') }}
        </v-btn>
      </div>
    </template>
    <template v-else-if="available">
      <v-btn
        color="primary"
        variant="tonal"
        prepend-icon="mdi-discord"
        :loading="busy === 'connect'"
        :disabled="disabled || !!busy"
        data-id="discord-connect-button"
        @click="emit('connect')"
      >
        {{ $t('discord.connect.connect') }}
      </v-btn>
      <p class="text-body-small text-medium-emphasis mt-2 mb-0">
        {{ $t('discord.connect.hint') }}
      </p>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { discordChannelUrl } from '/imports/api/creature/log/discord/discordChannel';

/**
 * "Connect to Discord" (D4), for a character or a party board: Discord asks
 * which channel, and its webhook posts there; or, once connected, a link to
 * the channel and "Disconnect". The webhook's token never reaches the
 * browser: only where it posts. The parent calls the methods: it knows whose
 * channel it is.
 */
const props = defineProps({
  // The connected channel: { webhookId, guildId, channelId }
  channel: {
    type: Object,
    default: undefined,
  },
  // Whether this server has a Discord application to connect with
  available: Boolean,
  // 'connect' or 'disconnect' while its method runs
  busy: {
    type: String,
    default: undefined,
  },
  disabled: Boolean,
});

const emit = defineEmits(['connect', 'disconnect']);

const channelUrl = computed(() => discordChannelUrl(props.channel));
</script>
