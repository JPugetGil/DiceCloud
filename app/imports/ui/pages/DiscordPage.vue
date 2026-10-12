<template>
  <v-container class="bg-page">
    <v-row class="justify-center">
      <v-col
        cols="12"
        md="6"
        lg="5"
      >
        <v-card>
          <v-card-item prepend-icon="mdi-discord">
            <v-card-title class="text-wrap">
              {{ $t('discord.communityTitle') }}
            </v-card-title>
            <v-card-subtitle class="text-wrap">
              {{ $t('discord.communityText') }}
            </v-card-subtitle>
          </v-card-item>
          <v-card-text>
            <iframe
              :key="widgetTheme"
              :src="`https://discord.com/widget?id=999008140647469130&theme=${widgetTheme}`"
              :title="$t('discord.communityTitle')"
              class="discord-widget"
              width="100%"
              height="400"
              allowtransparency="true"
            />
          </v-card-text>
        </v-card>
        <!-- The application's commands and buttons (D6, D7), when this server takes interactions -->
        <v-card
          v-if="interactions"
          class="mt-4"
          data-id="discord-install"
        >
          <v-card-item prepend-icon="mdi-slash-forward-box">
            <v-card-title class="text-wrap">
              {{ $t('discord.installTitle') }}
            </v-card-title>
            <v-card-subtitle class="text-wrap">
              {{ $t('discord.installText') }}
            </v-card-subtitle>
          </v-card-item>
          <v-card-text>
            <ul class="pl-5 my-0 d-flex flex-column ga-2">
              <li
                v-for="name in COMMANDS"
                :key="name"
              >
                {{ $t(`discord.installCommands.${name}`) }}
              </li>
            </ul>
            <p class="mt-4 mb-0">
              {{ $t('discord.installButtons') }}
            </p>
            <!-- Its bot (phase D): what it does on a server, and /connect -->
            <p
              v-if="bot"
              class="mt-4 mb-0"
              data-id="discord-bot-text"
            >
              {{ $t('discord.installBot') }}
            </p>
          </v-card-text>
          <v-card-actions
            v-if="applicationId"
            class="px-4 pb-4 flex-wrap ga-2"
          >
            <!-- With a bot: a server's link asks for it and its permissions; an account's has none -->
            <template v-if="bot">
              <v-btn
                color="primary"
                variant="tonal"
                prepend-icon="mdi-server"
                :href="serverInstallUrl"
                target="_blank"
                rel="noopener"
                data-id="discord-install-server"
              >
                {{ $t('discord.installServerButton') }}
              </v-btn>
              <v-btn
                variant="tonal"
                prepend-icon="mdi-account"
                :href="accountInstallUrl"
                target="_blank"
                rel="noopener"
                data-id="discord-install-account"
              >
                {{ $t('discord.installAccountButton') }}
              </v-btn>
            </template>
            <v-btn
              v-else
              color="primary"
              variant="tonal"
              prepend-icon="mdi-discord"
              :href="installUrl"
              target="_blank"
              rel="noopener"
              data-id="discord-install-button"
            >
              {{ $t('discord.installButton') }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
      <v-col
        cols="12"
        md="6"
        lg="5"
      >
        <v-card>
          <v-card-item prepend-icon="mdi-webhook">
            <v-card-title class="text-wrap">
              {{ $t('discord.webhookTitle') }}
            </v-card-title>
            <v-card-subtitle class="text-wrap">
              {{ $t('discord.webhookText') }}
            </v-card-subtitle>
          </v-card-item>
          <v-card-text>
            <ol class="pl-5 my-0 d-flex flex-column ga-2">
              <li>{{ $t('discord.webhookStep1') }}</li>
              <li>{{ $t('discord.webhookStep2') }}</li>
              <li>{{ $t('discord.webhookStep3') }}</li>
            </ol>
            <p class="mt-4 mb-2">
              {{ $t('discord.webhookLanguage') }}
            </p>
            <p class="mb-0">
              {{ $t('discord.webhookPrivacy') }}
            </p>
            <!-- Connecting (D4), the party's channel (D2), sessions (D3), mentions and
                 signing in (D5), link previews (D1) -->
            <template
              v-for="section in SECTIONS"
              :key="section"
            >
              <h2 class="text-title-small mt-4 mb-1">
                {{ $t(`discord.${section}Title`) }}
              </h2>
              <p class="mb-0">
                {{ $t(`discord.${section}Text`) }}
              </p>
            </template>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { computed } from 'vue';
import { useTheme } from 'vuetify';
import { Meteor } from 'meteor/meteor';
import {
  installUrl as discordInstallUrl, serverInstallUrl as discordServerInstallUrl, accountInstallUrl as discordAccountInstallUrl,
} from '/imports/ui/discord/discordInstall';

const theme = useTheme();

// Discord draws the widget itself, in either of its two themes
const widgetTheme = computed(() => theme.current.value.dark ? 'dark' : 'light');

// The application's commands (D6), when this server takes interactions, and
// Discord's own installation link, which asks where: an account or a server
const interactions = !!Meteor.settings.public?.discordInteractions;
const applicationId = Meteor.settings.public?.discordApplicationId;
const installUrl = discordInstallUrl();
// With its bot (phase D): on a server, the bot and its four permissions; on
// an account, the commands alone
const bot = !!Meteor.settings.public?.discordBot;
const serverInstallUrl = discordServerInstallUrl();
const accountInstallUrl = discordAccountInstallUrl();
const COMMANDS = bot ? ['roll', 'check', 'hp', 'character', 'connect'] : ['roll', 'check', 'hp', 'character'];

// discord.<section>Title and discord.<section>Text
const SECTIONS = ['connectSection', 'partySection', 'sessions', 'mentions', 'signIn', 'previews'];
</script>

<style lang="css" scoped>
.discord-widget {
  border: 0;
  border-radius: 8px;
  display: block;
}
</style>
