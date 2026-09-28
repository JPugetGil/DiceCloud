<template>
  <div
    class="d-flex flex-1-1 flex-column align-center justify-center"
    style="height: 100%;"
  >
    <h1
      v-if="maintenanceMode"
      class="ma-4 text-h3"
    >
      {{ $t('maintenance.underMaintenance') }}
    </h1>
    <template v-else>
      <h1
        class="ma-4 text-h3"
      >
        {{ $t('maintenance.live') }}
      </h1>
      <v-btn
        color="accent"
        to="/"
      >
        {{ $t('maintenance.home') }}
      </v-btn>
    </template>
    <h1
      v-if="maintenanceMode && maintenanceMode.reason"
      class="ma-4 text-h4"
    >
      {{ maintenanceMode.reason }}
    </h1>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import MAINTENANCE_MODE from '/imports/constants/MAINTENANCE_MODE';

const maintenanceMode = ref(MAINTENANCE_MODE);
</script>
