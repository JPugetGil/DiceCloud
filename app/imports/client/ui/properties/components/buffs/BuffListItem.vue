<template>
  <v-list-item
    @click="$emit('click')"
  >
    <v-list-item-title>
      {{ model.name }}
    </v-list-item-title>

    <template
      v-if="!model.hideRemoveButton"
      #append
    >
      <v-btn
        variant="text"
        icon
        @click.stop="$emit('remove', model.id)"
      >
        <v-icon>mdi-delete</v-icon>
      </v-btn>
    </template>
  </v-list-item>
</template>

<script setup>
defineProps({
  model: {
    type: Object,
    required: true,
  },
});

defineEmits(['click', 'remove']);
</script>