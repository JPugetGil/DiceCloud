<template>
  <v-fade-transition mode="out-in">
    <div
      v-if="!subReady"
      key="character-loading"
      class="fill-height d-flex flex-1-1 justify-center align-center"
    >
      <v-progress-circular
        indeterminate
        color="primary"
        size="64"
      />
    </div>
    <character-sheet
      v-else
      show-menu-button
      :creature-id="route.params.id"
    />
  </v-fade-transition>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { subscribe } from 'vue-meteor-tracker';
import CharacterSheet from '/imports/client/ui/creature/character/CharacterSheet.vue';

const route = useRoute();

const { ready: ready } = subscribe(() => ['singleCharacter', route.params.id]);
const subReady = computed(() => ready.value);
</script>
