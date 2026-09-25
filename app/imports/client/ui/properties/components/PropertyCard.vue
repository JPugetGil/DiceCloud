<template>
  <component
    :is="components[model.type]"
    v-if="model && components[model.type]"
  />
  <v-card v-else-if="model">
    <v-card-title class="text--error">
      {{ $t('cards.undefinedCard', { type: model.type }) }}
    </v-card-title>
  </v-card>
</template>

<script setup>
import ActionCard from '/imports/client/ui/properties/components/actions/ActionCard.vue';

const components = {
  action: ActionCard,
};

defineProps({
  model: {
    type: Object,
    default: undefined,
  },
});
</script>
