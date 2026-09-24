<template>
  <v-card
    :to="doc.href"
    class="d-flex flex-column"
    @mouseover="hovering = true"
    @mouseleave="hovering = false"
  >
    <v-card-title>
      <svg-icon
        v-if="doc && doc.icon"
        :shape="doc.icon.shape"
        class="mr-2"
      />
      {{ doc.name }}
    </v-card-title>
    <v-card-text v-if="doc.description">
      <markdown-text
        v-if="doc"
        :markdown="doc.description"
      />
    </v-card-text>
    <card-highlight :active="hovering" />
  </v-card>
</template>

<script setup>
import { ref } from 'vue';
import MarkdownText from '/imports/client/ui/components/MarkdownText.vue';
import CardHighlight from '/imports/client/ui/components/CardHighlight.vue';

defineProps({
  doc: {
    type: Object,
    required: true,
  },
});

const hovering = ref(false);
</script>

<style scoped>
  .v-card {
    height: 240px;
  }
  /* Vuetify 3 renamed Vuetify 2's .v-card__text */
  .v-card-text {
    overflow: hidden;
    -webkit-mask-image: linear-gradient(to bottom, black 75%, transparent 95%);
    mask-image: linear-gradient(to bottom, black 75%, transparent 95%);
    pointer-events: none;
  }
</style>