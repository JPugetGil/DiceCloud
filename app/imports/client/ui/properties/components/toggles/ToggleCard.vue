<template>
  <v-card
    :class="hover ? 'elevation-8': ''"
    @click="click"
    @mouseover="hover = true"
    @mouseleave="hover = false"
  >
    <div class="d-flex flex-1-1 align-center">
      <div
        class="value d-flex flex-1-1 justify-center flex-grow-0"
      >
        <smart-checkbox
          :value="toggleValue"
          :disabled="toggleDisabled"
          @change="(val, ack) => toggleToggle(val, ack)"
          @click.stop=""
        />
      </div>
      <v-card-title class="name text-subtitle-1 text-truncate d-block pl-0">
        {{ model.name }}
      </v-card-title>
    </div>
    <card-highlight :active="hover" />
  </v-card>
</template>

<script setup>
import { ref, computed} from 'vue';
import flipToggle from '/imports/api/creature/creatureProperties/methods/flipToggle';
import CardHighlight from '/imports/client/ui/components/CardHighlight.vue';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['click']);


const hover = ref(false);


const toggleValue = computed(() => {
  if (props.model.enabled) return true;
  if (props.model.disabled) return false;
  if (!props.model.condition) return undefined;
  return !!props.model.condition.value;
});

const toggleDisabled = computed(() => {
  return !props.model.enabled && !props.model.disabled;
});

function click(e) {
  emit('click', e);
}

async function toggleToggle(value, ack) {
  try {
    await flipToggle.callAsync({ _id: props.model._id });
    ack?.();
  } catch (error) {
    console.warn(error);
    ack?.(error.reason || error);
  }
}
</script>

<style lang="css" scoped>
  .value {
    min-width: 64px;
    justify-content: center;
  }
</style>
