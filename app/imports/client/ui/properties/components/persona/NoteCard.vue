<template>
  <v-card
    :color="model.color"
    :data-id="model._id"
    hover
    :theme="model.color ? (isDark ? 'dark' : 'light') : undefined"
    @click="clickProperty(model._id)"
    @mouseover="hover = true"
    @mouseleave="hover = false"
  >
    <v-card-title class="text-h6">
      {{ model.name }}
    </v-card-title>
    <v-card-text v-if="model.summary">
      <property-description
        text
        :model="model.summary"
      />
    </v-card-text>
    <card-highlight
      :active="hover"
      :theme="theme.isDark ? 'dark' : 'light'"
    />
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue';
import PropertyDescription from '/imports/client/ui/properties/viewers/shared/PropertyDescription.vue';
import isDarkColor from '/imports/client/ui/utility/isDarkColor';
import CardHighlight from '/imports/client/ui/components/CardHighlight.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';
import useThemeState from '/imports/client/ui/utility/useThemeState';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const theme = useThemeState();

const hover = ref(false);

const dialogStackStore = useDialogStackStore();

const isDark = computed(() => {
  return isDarkColor(props.model.color);
});

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
