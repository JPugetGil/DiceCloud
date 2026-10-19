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
      {{ session && session.kind === 'channel' ? $t('discord.sessionOldHint') : $t('discord.sessionsHint') }}
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
      <!-- A forum's post, or the thread the bot creates in a text channel -->
      <v-btn
        variant="tonal"
        color="primary"
        prepend-icon="mdi-forum-outline"
        :loading="busy === 'start'"
        :disabled="disabled || !!busy || noBot"
        data-id="discord-session-start"
        @click="start"
      >
        {{ $t('discord.newSession') }}
      </v-btn>
      <!-- One of the last sessions of this channel -->
      <v-menu location="bottom start">
        <template #activator="{ props: menu }">
          <v-btn
            v-bind="menu"
            variant="tonal"
            prepend-icon="mdi-history"
            append-icon="mdi-menu-down"
            :loading="busy === 'resume'"
            :disabled="disabled || !!busy || !resumable.length"
            data-id="discord-session-resume"
          >
            {{ $t('discord.resumeSession') }}
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item
            v-for="past in resumable"
            :key="past.threadId"
            :title="past.name || $t('discord.session')"
            :subtitle="past.kind === 'forum' ? $t('discord.pastForum') : $t('discord.pastThread')"
            :data-thread-id="past.threadId"
            data-id="discord-session-resume-item"
            @click="resume(past)"
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
        @click="end"
      >
        {{ $t('discord.endSession') }}
      </v-btn>
    </div>
    <!-- A text channel without the bot: how to give it the thread -->
    <v-alert
      v-if="botAlert"
      type="warning"
      variant="tonal"
      density="compact"
      class="mt-3"
      data-id="discord-session-nobot"
    >
      <span data-id="discord-session-nobot-text">{{ botAlert }}</span>
      <div
        v-if="installLink"
        class="mt-2"
      >
        <v-btn
          variant="tonal"
          size="small"
          prepend-icon="mdi-server"
          :href="installLink"
          target="_blank"
          rel="noopener"
          data-id="discord-session-install"
        >
          {{ $t('discord.installServerButton') }}
        </v-btn>
      </div>
    </v-alert>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Meteor } from 'meteor/meteor';
import { resumableSessions } from '/imports/api/creature/log/discord/discordSession';
import {
  startPartySession, resumePartySession, endPartySession, partySessionAvailability,
} from '/imports/api/creature/creatureFolders/methods/discordMethods';
import {
  startCharacterSession, resumeCharacterSession, endCharacterSession, characterSessionAvailability,
} from '/imports/api/creature/creatures/methods/discordSessionMethods';
import { serverInstallUrl } from '/imports/ui/discord/discordInstall';
import boardErrorText from '/imports/ui/creature/party/boardErrorText';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import { sessionStartedText } from '/imports/ui/creature/discord/sessionStartedText';

/**
 * The Discord sessions (D3) of a party or of a character: whether one is
 * open and where its messages go; "New session", a forum's post or, in a
 * text channel, a thread DiceCloud's bot creates; "Resume a session", one of
 * the last ones of the channel connected now; "End session"; and, when its
 * thread stopped taking messages, that it ended. In a text channel the bot
 * cannot create a thread in, "New session" is unavailable, and says how to
 * fix it. It calls the methods of its holder: a party's game master, a
 * character's editors.
 */
const props = defineProps({
  // Whose sessions: { folderId } or { creatureId }
  holder: {
    type: Object,
    required: true,
  },
  // The session of the webhook set now, if one is open
  session: {
    type: Object,
    default: undefined,
  },
  // The last session, ended by itself when its thread closed: { name, at }
  closed: {
    type: Object,
    default: undefined,
  },
  // The last sessions, newest first (discordSession.ts)
  history: {
    type: /** @type {import('vue').PropType<import('/imports/api/creature/log/discord/discordSession').PastSession[]>} */ (Array),
    default: () => [],
  },
  // The channel connected now: its webhook's id, the channel and its server
  // when known, and what it is ('text' or 'forum') when known
  here: {
    type: Object,
    required: true,
  },
  disabled: Boolean,
});

const { t } = useI18n();

const methods = computed(() => props.holder.folderId ? {
  args: { folderId: props.holder.folderId },
  start: startPartySession, resume: resumePartySession, end: endPartySession, availability: partySessionAvailability,
} : {
  args: { creatureId: props.holder.creatureId },
  start: startCharacterSession, resume: resumeCharacterSession, end: endCharacterSession, availability: characterSessionAvailability,
});

// The sessions "Resume a session" offers: of this channel, but the one open
const resumable = computed(() => resumableSessions(props.history, {
  channelId: props.here.channelId, webhookId: props.here.webhookId, openThreadId: props.session?.threadId,
}));

// Whether a new session can open: the server asks the bot whether it sees
// the channel, again whenever the channel changes
const availability = ref('ready');
// The bot's refusal the last "New session" met: { status }
const problem = ref(/** @type {{ status?: string } | undefined} */ (undefined));
const noBot = computed(() => availability.value === 'noBot');

// The last question asked: an older answer arriving late is dropped
let asked = 0;
watch([
  () => props.holder.folderId, () => props.holder.creatureId, () => props.here.webhookId, () => props.here.channelId, () => props.here.kind,
], async () => {
  problem.value = undefined;
  const question = ++asked;
  let answer;
  try {
    answer = await methods.value.availability.callAsync(methods.value.args);
  } catch (error) {
    console.error(error);
  }
  if (question === asked) availability.value = answer?.newSession === 'noBot' ? 'noBot' : 'ready';
}, { immediate: true });

// This DiceCloud server's bot (phase D), which the link adds to a Discord server
const discordBot = !!Meteor.settings.public?.discordBot;
const installLink = computed(() => discordBot && (noBot.value || problem.value) ? serverInstallUrl(props.here.guildId) : undefined);

const botAlert = computed(() => {
  if (!noBot.value && !problem.value) return undefined;
  if (!discordBot) return t('discord.noBotHere');
  if (problem.value) return t('discord.botCannot', { status: problem.value.status || '–' });
  return t('discord.botMissing');
});

const stateText = computed(() => {
  const session = props.session;
  if (!session) return t('discord.sessionNone');
  if (session.kind === 'forum') return t('discord.sessionForum', { name: session.name });
  if (session.kind === 'thread') return t('discord.sessionThread', { name: session.name });
  return t('discord.sessionChannel', { name: session.name });
});

// 'start', 'resume' or 'end' while its method runs
const busy = ref(/** @type {'start' | 'resume' | 'end' | undefined} */ (undefined));

async function run(name, call) {
  busy.value = name;
  try {
    await call();
  } catch (error) {
    // A refusal from boardError: its details name the message, and the bot's status
    const refusal = /** @type {{ error?: string, details?: { i18n?: { params?: { status?: string } } } } | undefined} */ (error);
    // What the server explains is said, not logged
    if (!refusal?.details?.i18n) console.error(error);
    // The bot cannot create the thread: said under the buttons, with the way to fix it
    if (refusal?.error === 'discord.botUnavailable' || refusal?.error === 'discord.noBot') {
      problem.value = { status: refusal.details?.i18n?.params?.status };
    } else {
      snackbar({ text: boardErrorText(error, t) });
    }
  } finally {
    busy.value = undefined;
  }
}

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function start() {
  run('start', async () => {
    const opened = await methods.value.start.callAsync({ ...methods.value.args, timeZone: timeZone() });
    problem.value = undefined;
    if (opened) snackbar({ text: sessionStartedText(opened, t) });
  });
}

function resume(past) {
  run('resume', async () => {
    const opened = await methods.value.resume.callAsync({ ...methods.value.args, threadId: past.threadId, timeZone: timeZone() });
    if (opened) snackbar({ text: sessionStartedText(opened, t) });
  });
}

function end() {
  run('end', async () => {
    await methods.value.end.callAsync(methods.value.args);
    snackbar({ text: t('discord.sessionEnded') });
  });
}
</script>
