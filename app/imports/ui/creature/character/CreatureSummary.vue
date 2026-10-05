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
      <template v-if="creature.alignment || creature.gender">
        {{ creature.alignment }}<br>
        {{ creature.gender }}
      </template>
      <!-- Creation no longer asks for them: they are filled in here -->
      <div
        v-if="!creature.alignment || !creature.gender || !creature.picture"
        class="d-flex align-center ga-2 text-medium-emphasis"
        :class="{ 'mt-2': creature.alignment || creature.gender }"
        data-id="creature-summary-add"
      >
        <v-icon size="small">
          mdi-pencil-outline
        </v-icon>
        {{ $t('sheet.addBiography') }}
      </div>
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