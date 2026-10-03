<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <s3-usage-card />
      </v-col>
      <v-col cols="12">
        <user-roles-card />
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import S3UsageCard from '/imports/ui/admin/S3UsageCard.vue';
import UserRolesCard from '/imports/ui/admin/UserRolesCard.vue';
</script>
