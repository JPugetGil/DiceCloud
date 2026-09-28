<template>
  <v-card
    :hover="hasClickListener"
    :color="model.color"
    :theme="model.color ? (isDark ? 'dark' : 'light') : undefined"
    @click="click"
    @mouseover="hasClickListener ? hovering = true : undefined"
    @mouseleave="hasClickListener ? hovering = false : undefined"
  >
    <attribute-card-content :model="model" />
    <card-highlight :active="hasClickListener && hovering" />
  </v-card>
</template>

<script setup>
import { ref, computed, useAttrs } from 'vue';
import CardHighlight from '/imports/client/ui/components/CardHighlight.vue';
import AttributeCardContent from '/imports/client/ui/properties/components/attributes/AttributeCardContent.vue';
import isDarkColor from '/imports/client/ui/utility/isDarkColor';

const attrs = useAttrs();

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['click']);


const hovering = ref(false);

const hasClickListener = computed(() => {
  return !!attrs.onClick
});

const isDark = computed(() => {
  if (!props.model.color) return;
  return isDarkColor(props.model.color);
});

function click(e) {
  emit('click', e);
}
</script>
