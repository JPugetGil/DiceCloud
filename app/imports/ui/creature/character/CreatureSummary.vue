<template>
  <v-card
    hover
    data-id="creature-summary"
    @mouseover="hover = true"
    @mouseleave="hover = false"
    @click="showCharacterForm"
  >
    <v-img
      v-if="creature.picture"
      cover
      :src="creature.picture"
    />
    <v-card-title class="text-title-large">
      {{ creature.name }}
    </v-card-title>
    <v-card-text>
      {{ creature.alignment }}<br>
      {{ creature.gender }}
    </v-card-text>
    <card-highlight :active="hover" />
  </v-card>
</template>

<script setup>
import { ref } from 'vue';
import CardHighlight from '/imports/ui/components/CardHighlight.vue';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  creature: {
    type: Object,
    required: true,
  },
});


const hover = ref(false);

function showCharacterForm() {
  dialogStackStore.pushDialogStack({
    component: 'creature-form-dialog',
    elementId: 'creature-summary',
    data: {
      _id: props.creature._id,
    },
  });
}
</script>

<style>

</style>