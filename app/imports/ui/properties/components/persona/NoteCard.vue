<template>
  <v-card
    v-bind="userSurface(model.color)"
    :data-id="model._id"
    hover
    @click="clickProperty(model._id)"
    @mouseover="hover = true"
    @mouseleave="hover = false"
  >
    <v-card-title class="text-title-large">
      {{ model.name }}
    </v-card-title>
    <v-card-text v-if="model.summary">
      <property-description
        text
        :model="model.summary"
      />
    </v-card-text>
    <card-highlight :active="hover" />
  </v-card>
</template>

<script setup>
import { ref } from 'vue';
import PropertyDescription from '/imports/ui/properties/viewers/shared/PropertyDescription.vue';
import useUserSurface from '/imports/ui/composables/useUserSurface';
import CardHighlight from '/imports/ui/components/CardHighlight.vue';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

// The user's colour as a large surface: its tone for the theme (D2)
const userSurface = useUserSurface();

defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const hover = ref(false);

const dialogStackStore = useDialogStackStore();

function clickProperty(_id) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: `${_id}`,
    data: { _id },
  });
}
</script>

<style lang="css" scoped>

</style>
