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
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { Meteor } from 'meteor/meteor';
import { discordConnectedCounts } from '/imports/api/discord/methods/discordOAuthMethods';

/**
 * How many Discord servers and channels DiceCloud's application posts to
 * (D4): Discord asks an application to be verified, its owner's identity
 * checked, beyond 100 servers
 */
const discordOAuth = !!Meteor.settings.public?.discordOAuth;
const counts = ref(undefined);
const loading = ref(false);
const error = ref(undefined);

async function refresh() {
  loading.value = true;
  try {
    counts.value = await discordConnectedCounts.callAsync();
    error.value = undefined;
  } catch (e) {
    error.value = e.reason || e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>
