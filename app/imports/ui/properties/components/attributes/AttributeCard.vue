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
import { ref, computed } from 'vue';
import CardHighlight from '/imports/ui/components/CardHighlight.vue';
import AttributeCardContent from '/imports/ui/properties/components/attributes/AttributeCardContent.vue';
import isDarkColor from '/imports/ui/utility/isDarkColor';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  // The parent's listeners, declared so that the card knows whether it is
  // clickable: Vue keeps a declared event's listeners out of $attrs.
  // `emit()` still calls them.
  onClick: {
    type: Function,
    default: undefined,
  },
});

const emit = defineEmits(['click']);


const hovering = ref(false);

const hasClickListener = computed(() => {
  return !!props.onClick
});

const isDark = computed(() => {
  if (!props.model.color) return;
  return isDarkColor(props.model.color);
});

function click(e) {
  emit('click', e);
}
</script>
