<template>
  <v-banner
    v-if="!connected"
    sticky
    single-line
    :icon="icon"
    :color="color"
    style="top: 96px;"
  >
    {{ status }}
  </v-banner>
</template>

<script setup lang="js">
import { computed } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';

const status = autorun(() => Meteor.status().status).result;
const connected = autorun(() => Meteor.status().connected).result;

const icon = computed(() => {
  switch (status.value) {
    case 'connecting': return 'mdi-connection';
    case 'offline': return 'mdi-close-outline';
    case 'waiting': return 'mdi-timer-sand-empty';
    case 'failed': return 'mdi-alert-circle';
    default: return 'mdi-close-outline';
  }
});

const color = computed(() => {
  switch (status.value) {
    case 'connecting': return 'warning';
    case 'offline': return 'error';
    case 'waiting': return 'error';
    case 'failed': return 'error';
    default: return 'info';
  }
});
</script>