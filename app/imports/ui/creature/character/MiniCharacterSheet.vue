<template>
  <v-card
    hover
    @click="$emit('click')"
  >
    {{ $t('sheet.miniSheet') }}
  </v-card>
</template>

<script setup>
defineEmits(['click'])
</script>

<style lang="css" scoped>
</style>
