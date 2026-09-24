<template>
  <v-card
    hover
    @click="$emit('click')"
  >
    Character sheet
  </v-card>
</template>

<script setup>
defineEmits(['click'])
</script>

<style lang="css" scoped>
</style>
