<template>
  <div
    class="discord-session"
    data-id="discord-session"
  >
    <div class="text-label-large mb-1">
      {{ $t('discord.session') }}
    </div>
    <p
      class="text-body-medium my-0"
      data-id="discord-session-state"
    >
      {{ stateText }}
    </p>
    <p class="text-body-small text-medium-emphasis mt-1 mb-0">
      {{ session?.kind === 'channel' ? $t('discord.sessionTextChannelHint') : $t('discord.characterSessionHint') }}
    </p>
    <div class="d-flex flex-wrap ga-2 mt-2">
      <v-btn
        variant="tonal"
        color="primary"
        prepend-icon="mdi-forum-outline"
        :loading="busy === 'start'"
        :disabled="disabled || !!busy"
        data-id="discord-session-start"
        @click="emit('start')"
      >
        {{ $t('discord.newSession') }}
      </v-btn>
      <v-btn
        v-if="session"
        variant="text"
        prepend-icon="mdi-close-circle-outline"
        :loading="busy === 'end'"
        :disabled="disabled || !!busy"
        data-id="discord-session-end"
        @click="emit('end')"
      >
        {{ $t('discord.endSession') }}
      </v-btn>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * A Discord session (D3) of a party or of a character: whether one is open
 * and where its messages go, with the buttons that open a new one and end
 * it. The parent calls the methods: it knows whose session it is.
 */
const props = defineProps({
  // The session of the webhook set now, if one is open
  session: {
    type: Object,
    default: undefined,
  },
  // 'start' or 'end' while its method runs
  busy: {
    type: String,
    default: undefined,
  },
  disabled: Boolean,
});

const emit = defineEmits(['start', 'end']);

const { t } = useI18n();

const stateText = computed(() => {
  const session = props.session;
  if (!session) return t('discord.sessionNone');
  return session.kind === 'forum'
    ? t('discord.sessionForum', { name: session.name })
    : t('discord.sessionChannel', { name: session.name });
});
</script>
