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
    <!-- Its thread stopped taking messages: the session ended by itself -->
    <v-alert
      v-if="closed && !session"
      type="info"
      variant="tonal"
      density="compact"
      class="mt-2"
      data-id="discord-session-closed"
    >
      {{ $t('discord.sessionClosed', { name: closed.name || '' }) }}
    </v-alert>
    <div class="d-flex flex-wrap ga-2 mt-2">
      <!-- A header message in the channel (a post of its own in a forum), or a thread of the channel -->
      <v-menu location="bottom start">
        <template #activator="{ props: menu }">
          <v-btn
            v-bind="menu"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-forum-outline"
            append-icon="mdi-menu-down"
            :loading="busy === 'start'"
            :disabled="disabled || !!busy"
            data-id="discord-session-start"
          >
            {{ $t('discord.newSession') }}
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item
            :title="$t('discord.newSessionHeader')"
            :subtitle="$t('discord.newSessionHeaderHint')"
            data-id="discord-session-header"
            @click="emit('start')"
          />
          <v-list-item
            :title="$t('discord.newSessionThread')"
            :subtitle="$t('discord.newSessionThreadHint')"
            data-id="discord-session-thread"
            @click="threadForm = true"
          />
        </v-list>
      </v-menu>
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
    <!-- In a thread: the game master makes it in Discord and pastes its link -->
    <form
      v-if="threadForm"
      class="mt-3"
      data-id="discord-thread-form"
      @submit.prevent="startInThread"
    >
      <p class="text-body-small text-medium-emphasis mt-0 mb-2">
        {{ $t('discord.threadHelp') }}
      </p>
      <div class="d-flex flex-wrap align-start ga-2">
        <v-text-field
          v-model="threadLink"
          :label="$t('discord.threadLink')"
          placeholder="https://discord.com/channels/…/…"
          variant="outlined"
          density="compact"
          autocomplete="off"
          spellcheck="false"
          hide-details="auto"
          class="flex-1-1"
          style="min-width: 200px;"
          data-id="discord-thread-link"
        />
        <v-btn
          type="submit"
          variant="tonal"
          :disabled="!threadLink.trim() || !!busy"
          :loading="busy === 'start'"
          data-id="discord-thread-open"
        >
          {{ $t('discord.threadOpen') }}
        </v-btn>
        <v-btn
          variant="text"
          :disabled="!!busy"
          @click="closeThreadForm"
        >
          {{ $t('discord.pasted.cancel') }}
        </v-btn>
      </div>
    </form>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * A Discord session (D3) of a party or of a character: whether one is open
 * and where its messages go, with the buttons that open a new one (a header
 * message in the channel, a post of its own in a forum, or a thread of the
 * channel whose link the user pastes) and end it; and, when its thread
 * stopped taking messages, that it ended. The parent calls the methods: it
 * knows whose session it is; `start` comes with the thread's link, if any.
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
  // The last session, ended by itself when its thread closed: { name, at }
  closed: {
    type: Object,
    default: undefined,
  },
});

const emit = defineEmits(['start', 'end']);

const threadForm = ref(false);
const threadLink = ref('');

function closeThreadForm() {
  threadForm.value = false;
  threadLink.value = '';
}

function startInThread() {
  const link = threadLink.value.trim();
  if (link) emit('start', link);
}

// Opened in its thread: the form is done
watch(() => props.session?.threadId, threadId => {
  if (threadId && props.session?.kind === 'thread') closeThreadForm();
});

const { t } = useI18n();

const stateText = computed(() => {
  const session = props.session;
  if (!session) return t('discord.sessionNone');
  if (session.kind === 'forum') return t('discord.sessionForum', { name: session.name });
  if (session.kind === 'thread') return t('discord.sessionThread', { name: session.name });
  return t('discord.sessionChannel', { name: session.name });
});
</script>
