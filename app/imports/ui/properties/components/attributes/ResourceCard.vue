<template>
  <v-card
    class="resource-card"
    :class="hover ? 'elevation-3': ''"
    v-bind="userSurface(model.color)"
  >
    <resource-card-content
      :model="model"
      @mouseover="hover = true"
      @mouseleave="hover = false"
      @click="$emit('click')"
      @change="e => $emit('change', e)"
    />
    <card-highlight :active="hover" />
  </v-card>
</template>

<script setup>
import { ref } from 'vue';
import CardHighlight from '/imports/ui/components/CardHighlight.vue';
import ResourceCardContent from '/imports/ui/properties/components/attributes/ResourceCardContent.vue';
import useUserSurface from '/imports/ui/composables/useUserSurface';

// The user's colour as a large surface: its tone for the theme (D2)
const userSurface = useUserSurface();

defineProps({
  model: {
    type: Object,
    required: true,
  },
});

defineEmits(['click', 'change']);


const hover = ref(false);
</script>

<style lang="css">
.resource-card {
  transition: box-shadow .4s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.resource-card > div {
  padding-top: 16px;
  padding-bottom: 16px;
}
</style>
