<template>
  <v-card data-id="discord-usage">
    <v-card-title class="d-flex align-center">
      {{ $t('admin.discord.title') }}
      <v-spacer />
      <v-btn
        icon="mdi-refresh"
        variant="text"
        :loading="loading"
        :aria-label="$t('admin.refresh')"
        :title="$t('admin.refresh')"
        @click="refresh"
      />
    </v-card-title>
    <v-card-text>
      <v-alert
        v-if="error"
        type="error"
      >
        {{ error }}
      </v-alert>
      <template v-else-if="counts">
        <v-alert
          v-if="!discordOAuth"
          type="info"
          variant="tonal"
          class="mb-4"
        >
          {{ $t('admin.discord.notConfigured') }}
        </v-alert>
        <v-row>
          <v-col
            cols="6"
            data-id="discord-servers"
          >
            <div class="text-label-large text-medium-emphasis">
              {{ $t('admin.discord.servers') }}
            </div>
            <div class="text-headline-small">
              {{ counts.servers }}
            </div>
          </v-col>
          <v-col
            cols="6"
            data-id="discord-channels"
          >
            <div class="text-label-large text-medium-emphasis">
              {{ $t('admin.discord.channels') }}
            </div>
            <div class="text-headline-small">
              {{ counts.channels }}
            </div>
          </v-col>
        </v-row>
        <p class="text-body-small text-medium-emphasis mt-2 mb-0">
          {{ $t('admin.discord.verificationHint') }}
        </p>
        <!-- The slash commands (D6): registered at startup when they change -->
        <div
          v-if="commands"
          class="mt-4"
          data-id="discord-commands"
        >
          <div class="text-label-large text-medium-emphasis">
            {{ $t('admin.discord.commands') }}
          </div>
          <p
            v-if="!commands.interactions"
            class="text-body-medium my-1"
          >
            {{ $t('admin.discord.commandsOff') }}
          </p>
          <p
            v-else-if="commands.registeredAt"
            class="text-body-medium my-1"
          >
            {{ $t(commands.upToDate ? 'admin.discord.commandsRegistered' : 'admin.discord.commandsOutdated', {
              date: new Date(commands.registeredAt).toLocaleString(locale),
              count: commands.count,
              hash: (commands.registeredHash || '').slice(0, 12),
            }) }}
          </p>
          <p
            v-else
            class="text-body-medium my-1"
          >
            {{ $t('admin.discord.commandsNever') }}
          </p>
        </div>
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup>
import errorText from '/imports/api/utility/errorText';
import { ref, onMounted } from 'vue';
import { Meteor } from 'meteor/meteor';
import { useI18n } from 'vue-i18n';
import { discordCommandsStatus, discordConnectedCounts } from '/imports/api/discord/methods/discordOAuthMethods';

/**
 * How many Discord servers and channels DiceCloud's application posts to
 * (D4): Discord asks an application to be verified, its owner's identity
 * checked, beyond 100 servers. And its slash commands (D6): when they were
 * last registered, under which hash, and whether they are the current ones
 */
const discordOAuth = !!Meteor.settings.public?.discordOAuth;
const { locale } = useI18n();
const counts = ref(/** @type {Awaited<ReturnType<typeof discordConnectedCounts.callAsync>>} */ (undefined));
const commands = ref(/** @type {Awaited<ReturnType<typeof discordCommandsStatus.callAsync>>} */ (undefined));
const loading = ref(false);
const error = ref(/** @type {string | undefined} */ (undefined));

async function refresh() {
  loading.value = true;
  try {
    counts.value = await discordConnectedCounts.callAsync();
    commands.value = await discordCommandsStatus.callAsync();
    error.value = undefined;
  } catch (e) {
    error.value = errorText(e);
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>
