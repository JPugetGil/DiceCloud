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
            <!-- The party's channel (D2), sessions (D3), link previews (D1) -->
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

const theme = useTheme();

// Discord draws the widget itself, in either of its two themes
const widgetTheme = computed(() => theme.current.value.dark ? 'dark' : 'light');

// discord.<section>Title and discord.<section>Text
const SECTIONS = ['partySection', 'sessions', 'previews'];
</script>

<style lang="css" scoped>
.discord-widget {
  border: 0;
  border-radius: 8px;
  display: block;
}
</style>
