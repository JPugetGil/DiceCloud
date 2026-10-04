<template>
  <v-list-item
    @click="$emit('click')"
  >
    <v-list-item-title>
      {{ model.name }}
    </v-list-item-title>
    <v-list-item-subtitle v-if="roundsLeft !== undefined">
      <v-icon
        size="x-small"
        start
      >
        mdi-timer-sand
      </v-icon>{{ $t('combat.roundsLeft', { count: roundsLeft }, roundsLeft) }}
    </v-list-item-subtitle>

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
import { computed } from 'vue';
import { buffRoundsLeft } from '/imports/api/creature/creatureFolders/buffDurations';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

// Counted down by a party's initiative tracker
const roundsLeft = computed(() => buffRoundsLeft(props.model));

defineEmits(['click', 'remove']);
</script>